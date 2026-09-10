import { CheckCircle2, PlayCircle, Clock, PauseCircle, XCircle } from "lucide-react";

interface StatusBadgeProps {
  status: string;
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  switch (status) {
    case "in_progress":
      return (
        <span className="badge badge-progress">
          <PlayCircle size={12} />
          In Progress
        </span>
      );
    case "completed":
      return (
        <span className="badge badge-completed">
          <CheckCircle2 size={12} />
          Completed
        </span>
      );
    case "on_hold":
      return (
        <span className="badge badge-on-hold">
          <PauseCircle size={12} />
          On Hold
        </span>
      );
    case "dropped":
      return (
        <span className="badge badge-dropped">
          <XCircle size={12} />
          Dropped
        </span>
      );
    case "plan_to_consume":
    default:
      return (
        <span className="badge badge-plan">
          <Clock size={12} />
          Plan to Track
        </span>
      );
  }
}
