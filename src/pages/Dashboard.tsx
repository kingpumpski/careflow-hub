import { FileCheck, Shield, CreditCard, AlertTriangle, TrendingUp, Building2 } from "lucide-react";
import StatCard from "@/components/dashboard/StatCard";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend } from "recharts";

const claimsData = [
  { month: "Jan", submitted: 42, paid: 35, rejected: 4 },
  { month: "Feb", submitted: 38, paid: 30, rejected: 5 },
  { month: "Mar", submitted: 55, paid: 48, rejected: 3 },
  { month: "Apr", submitted: 47, paid: 40, rejected: 6 },
  { month: "May", submitted: 61, paid: 52, rejected: 4 },
  { month: "Jun", submitted: 53, paid: 45, rejected: 5 },
];

const statusData = [
  { name: "Paid", value: 250, color: "hsl(152, 60%, 42%)" },
  { name: "Pending", value: 85, color: "hsl(38, 92%, 50%)" },
  { name: "Rejected", value: 27, color: "hsl(0, 72%, 51%)" },
  { name: "Appealed", value: 12, color: "hsl(280, 60%, 50%)" },
];

const revenueData = [
  { month: "Jan", revenue: 125000, target: 130000 },
  { month: "Feb", revenue: 118000, target: 130000 },
  { month: "Mar", revenue: 152000, target: 140000 },
  { month: "Apr", revenue: 141000, target: 140000 },
  { month: "May", revenue: 165000, target: 150000 },
  { month: "Jun", revenue: 158000, target: 150000 },
];

const topInsurers = [
  { name: "ACACIA Health", claims: 87, amount: "GH¢ 245,000", color: "bg-chart-1" },
  { name: "ACE Insurance", claims: 64, amount: "GH¢ 180,500", color: "bg-chart-2" },
  { name: "APEX Health", claims: 52, amount: "GH¢ 156,200", color: "bg-chart-3" },
  { name: "STAR Assurance", claims: 45, amount: "GH¢ 132,800", color: "bg-chart-4" },
];

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-description">Overview of your claims and insurance operations</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Claims" value="374" change="+12% from last month" changeType="positive" icon={Shield} />
        <StatCard title="Pre-Authorizations" value="156" change="+5 today" changeType="positive" icon={FileCheck} iconColor="bg-accent/10 text-accent" />
        <StatCard title="Total Payments" value="GH¢ 859K" change="+8.2% revenue" changeType="positive" icon={CreditCard} iconColor="bg-success/10 text-success" />
        <StatCard title="Outstanding" value="GH¢ 142K" change="27 claims pending" changeType="negative" icon={AlertTriangle} iconColor="bg-warning/10 text-warning" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 stat-card">
          <h3 className="font-heading font-semibold mb-4">Claims Overview</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={claimsData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(214, 20%, 90%)" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="submitted" fill="hsl(210, 78%, 42%)" radius={[4, 4, 0, 0]} name="Submitted" />
              <Bar dataKey="paid" fill="hsl(168, 72%, 40%)" radius={[4, 4, 0, 0]} name="Paid" />
              <Bar dataKey="rejected" fill="hsl(0, 72%, 51%)" radius={[4, 4, 0, 0]} name="Rejected" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="stat-card">
          <h3 className="font-heading font-semibold mb-4">Claim Status</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={statusData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={3}>
                {statusData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="grid grid-cols-2 gap-2 mt-2">
            {statusData.map((s) => (
              <div key={s.name} className="flex items-center gap-2 text-xs">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                <span className="text-muted-foreground">{s.name}</span>
                <span className="font-semibold ml-auto">{s.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 stat-card">
          <h3 className="font-heading font-semibold mb-4">Revenue Trends</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={revenueData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(214, 20%, 90%)" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${v / 1000}k`} />
              <Tooltip formatter={(v: number) => `GH¢ ${v.toLocaleString()}`} />
              <Legend />
              <Line type="monotone" dataKey="revenue" stroke="hsl(210, 78%, 42%)" strokeWidth={2} dot={{ r: 4 }} name="Revenue" />
              <Line type="monotone" dataKey="target" stroke="hsl(168, 72%, 40%)" strokeWidth={2} strokeDasharray="5 5" dot={false} name="Target" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="stat-card">
          <h3 className="font-heading font-semibold mb-4 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-primary" />
            Top Insurance Partners
          </h3>
          <div className="space-y-3">
            {topInsurers.map((ins, i) => (
              <div key={ins.name} className="flex items-center gap-3">
                <span className="text-xs font-bold text-muted-foreground w-4">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{ins.name}</p>
                  <p className="text-xs text-muted-foreground">{ins.claims} claims</p>
                </div>
                <span className="text-sm font-semibold">{ins.amount}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
