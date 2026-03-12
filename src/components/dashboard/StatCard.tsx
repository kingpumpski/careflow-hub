import { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon: LucideIcon;
  iconColor?: string;
}

export default function StatCard({ title, value, change, changeType = "neutral", icon: Icon, iconColor }: StatCardProps) {
  const changeColors = {
    positive: "text-success",
    negative: "text-destructive",
    neutral: "text-muted-foreground",
  };

  return (
    <div className="stat-card animate-fade-in">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground font-medium">{title}</p>
          <p className="text-2xl font-bold font-heading mt-1">{value}</p>
          {change && (
            <p className={`text-xs mt-1 font-medium ${changeColors[changeType]}`}>
              {change}
            </p>
          )}
        </div>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${iconColor || "bg-primary/10 text-primary"}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}
