import { Plus, Search, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const mockDoctors = [
  { id: 1, name: "Dr. Akua Boateng", specialty: "Radiology", hospital: "Korle Bu Hospital", contact: "+233 24 111 2222" },
  { id: 2, name: "Dr. Kwadwo Mensah", specialty: "Surgery", hospital: "37 Military Hospital", contact: "+233 20 333 4444" },
  { id: 3, name: "Dr. Abena Asante", specialty: "Internal Medicine", hospital: "Ridge Hospital", contact: "+233 27 555 6666" },
];

export default function Doctors() {
  return (
    <div className="space-y-6">
      <div className="page-header flex items-start justify-between">
        <div>
          <h1 className="page-title">Doctors</h1>
          <p className="page-description">Manage registered doctors and their specialties</p>
        </div>
        <Button className="gap-2"><Plus className="w-4 h-4" />Add Doctor</Button>
      </div>

      <div className="stat-card">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search doctors..." className="pl-10 h-9" />
          </div>
        </div>

        <table className="data-table">
          <thead>
            <tr>
              <th>Doctor</th>
              <th>Specialty</th>
              <th>Hospital</th>
              <th>Contact</th>
            </tr>
          </thead>
          <tbody>
            {mockDoctors.map((d) => (
              <tr key={d.id} className="hover:bg-muted/50 transition-colors">
                <td className="font-medium flex items-center gap-2">
                  <Stethoscope className="w-4 h-4 text-primary" />
                  {d.name}
                </td>
                <td><Badge variant="secondary">{d.specialty}</Badge></td>
                <td className="text-muted-foreground">{d.hospital}</td>
                <td className="text-muted-foreground">{d.contact}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
