
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
}

export const PageHeader = ({ title, description, children, className }: PageHeaderProps) => {
  return (
    <div className={cn("border-b bg-white/50 backdrop-blur-sm z-40", className)}>
      <div className="px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
            {description && (
              <p className="text-sm text-gray-600 mt-1">{description}</p>
            )}
          </div>
          {children && (
            <div className="flex items-center gap-2">
              {children}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
