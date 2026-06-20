import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

interface Body {
  preauth_id: string;
  to: string;
  cc?: string[];
  subject: string;
  body: string;
  pdf_base64: string;
  pdf_filename: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace('Bearer ', '');
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userId = claims.claims.sub as string;
    const userEmail = (claims.claims.email as string) || '';

    const payload = (await req.json()) as Body;
    if (!payload.preauth_id || !payload.to || !payload.pdf_base64) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Load SMTP config from system_settings
    const { data: settings } = await admin
      .from('system_settings')
      .select('key, value')
      .in('key', [
        'smtp_host', 'smtp_port', 'smtp_user', 'smtp_password',
        'smtp_secure', 'claims_sender_email', 'provider_name',
      ]);
    const cfg: Record<string, string> = {};
    (settings || []).forEach((s: any) => { cfg[s.key] = s.value || ''; });

    const logRow: any = {
      preauth_id: payload.preauth_id,
      to_email: payload.to,
      cc_emails: payload.cc || [],
      subject: payload.subject,
      attempted_by: userId,
      attempted_by_name: userEmail,
    };

    if (!cfg.smtp_host || !cfg.smtp_user || !cfg.smtp_password) {
      logRow.status = 'failed';
      logRow.error_message = 'SMTP not configured. Please set host/user/password in Settings → Email (SMTP).';
      await admin.from('preauth_email_log').insert(logRow);
      return new Response(JSON.stringify({ ok: false, error: logRow.error_message }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    try {
      const client = new SMTPClient({
        connection: {
          hostname: cfg.smtp_host,
          port: parseInt(cfg.smtp_port || '587', 10),
          tls: cfg.smtp_secure === 'true' || cfg.smtp_port === '465',
          auth: { username: cfg.smtp_user, password: cfg.smtp_password },
        },
      });

      const fromAddr = cfg.claims_sender_email || cfg.smtp_user;
      const fromName = cfg.provider_name || 'Claims Department';

      await client.send({
        from: `${fromName} <${fromAddr}>`,
        to: payload.to,
        cc: payload.cc && payload.cc.length ? payload.cc : undefined,
        subject: payload.subject,
        content: payload.body,
        attachments: [{
          filename: payload.pdf_filename,
          content: payload.pdf_base64,
          encoding: 'base64',
          contentType: 'application/pdf',
        }],
      });
      await client.close();

      logRow.status = 'sent';
      logRow.sent_at = new Date().toISOString();
      logRow.provider_response = `Delivered to ${payload.to} via ${cfg.smtp_host}`;
      await admin.from('preauth_email_log').insert(logRow);

      await admin.from('pre_authorizations').update({
        email_sent_at: new Date().toISOString(),
      }).eq('id', payload.preauth_id);

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (e: any) {
      logRow.status = 'failed';
      logRow.error_message = e?.message || String(e);
      await admin.from('preauth_email_log').insert(logRow);
      return new Response(JSON.stringify({ ok: false, error: logRow.error_message }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'Server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});