import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CheckCircle, XCircle, Clock, AlertTriangle, Edit3 } from "lucide-react";
import { useUserRole } from "@/hooks/useConversions";
import { AmendConversionForm } from "@/components/forms/AmendConversionForm";
import type { Database } from "@/integrations/supabase/types";

type ConversionStatus = Database["public"]["Enums"]["conversion_status"];

interface DetailedConversionsTableProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dateFilter?: 'today' | 'week' | 'month';
  title?: string;
  scope?: 'team' | 'user';
}

export const DetailedConversionsTable = ({ open, onOpenChange, dateFilter, title = "Detailed Conversions", scope }: DetailedConversionsTableProps) => {
  const { user, userRole } = useAuth();
  const { data: currentUserRole } = useUserRole();
  
  const [amendDialog, setAmendDialog] = useState<{
    open: boolean;
    conversion: any;
  }>({ open: false, conversion: null });

  const { data: conversions, isLoading, refetch } = useQuery({
    queryKey: ['detailed-conversions', scope === 'team' ? 'team' : user?.id, userRole, dateFilter],
    queryFn: async () => {
      if (!user) return [];
      let query = supabase
        .from('conversions')
        .select(`
          *,
          leads (
            company_name,
            contact_name,
            source
          ),
          profiles!inner(full_name, email)
        `);

      // Only filter by user if not team scope
      if (scope !== 'team' && !['manager', 'director', 'admin'].includes(userRole || '')) {
        query = query.eq('rep_id', user.id);
      }

      // Apply date filter
      const today = new Date();
      if (dateFilter === 'today') {
        query = query.eq('conversion_date', format(today, 'yyyy-MM-dd'));
      } else if (dateFilter === 'week') {
        const weekStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay());
        query = query.gte('conversion_date', format(weekStart, 'yyyy-MM-dd'));
      } else if (dateFilter === 'month') {
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        query = query.gte('conversion_date', format(monthStart, 'yyyy-MM-dd'));
      }

      const { data, error } = await query.order('conversion_date', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user && open
  });

  const getStatusIcon = (status: ConversionStatus) => {
    switch (status) {
      case "pending":
        return <Clock className="w-4 h-4 text-yellow-500" />;
      case "recommended":
        return <AlertTriangle className="w-4 h-4 text-blue-500" />;
      case "approved":
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case "rejected":
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Clock className="w-4 h-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status: ConversionStatus) => {
    switch (status) {
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "recommended":
        return "bg-blue-100 text-blue-800";
      case "approved":
        return "bg-green-100 text-green-800";
      case "rejected":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const handleAmendConversion = (conversion: any) => {
    setAmendDialog({ open: true, conversion });
  };

  if (isLoading) {
    return <div className="flex items-center justify-center p-8">Loading conversions...</div>;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Revenue</TableHead>
                <TableHead>Commissionable Amount</TableHead>
                <TableHead>Commission</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Sales Rep</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {conversions?.map((conversion) => (
                <TableRow key={conversion.id}>
                  <TableCell>{format(new Date(conversion.conversion_date), 'MMM dd, yyyy')}</TableCell>
                  <TableCell className="font-medium">{conversion.leads?.company_name || 'N/A'}</TableCell>
                  <TableCell>{conversion.leads?.contact_name || 'N/A'}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{conversion.leads?.source || 'N/A'}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <span className="font-semibold text-green-600">
                        {conversion.currency || 'USD'} {Number(conversion.revenue_amount).toLocaleString()}
                      </span>
                      {conversion.status === 'approved' && <CheckCircle className="h-4 w-4 text-green-500" />}
                      {conversion.status === 'rejected' && <XCircle className="h-4 w-4 text-red-500" />}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="font-semibold text-blue-600">
                      {conversion.currency || 'USD'} {Number(conversion.commissionable_amount ?? conversion.revenue_amount).toLocaleString()}
                    </span>
                  </TableCell>
                  <TableCell>
                    {conversion.commission_amount ? (
                      <div className="flex items-center gap-1">
                        <div>
                          <span className="font-medium">
                            {conversion.currency || 'USD'} {Number(conversion.commission_amount).toLocaleString()}
                          </span>
                          {conversion.commission_rate && (
                            <p className="text-xs text-gray-600">
                              ({conversion.commission_rate}%)
                            </p>
                          )}
                        </div>
                        {conversion.status === 'approved' && <CheckCircle className="h-4 w-4 text-green-500" />}
                        {conversion.status === 'rejected' && <XCircle className="h-4 w-4 text-red-500" />}
                      </div>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const isAutoApproved = conversion.status === 'approved' && 
                        conversion.workflow_notes?.includes('Auto-approved: Zero commission');
                      
                      if (isAutoApproved) {
                        return (
                          <Badge className="flex items-center gap-1 bg-blue-100 text-blue-800">
                            {getStatusIcon('approved')}
                            AUTO-APPROVED
                          </Badge>
                        );
                      }
                      
                      return (
                        <Badge className={`flex items-center gap-1 ${getStatusColor(conversion.status || 'pending')}`}>
                          {getStatusIcon(conversion.status || 'pending')}
                          {(conversion.status || 'pending').replace('_', ' ').toUpperCase()}
                        </Badge>
                      );
                    })()}
                  </TableCell>
                  <TableCell>{conversion.profiles?.full_name || conversion.profiles?.email || 'Unknown'}</TableCell>
                  <TableCell>
                    <div className="max-w-xs truncate">
                      {conversion.notes || 'No notes'}
                      {conversion.rejection_reason && (
                        <div className="text-xs text-red-600 mt-1">
                          Rejected: {conversion.rejection_reason}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {conversion.status === 'rejected' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleAmendConversion(conversion)}
                        className="text-orange-600 border-orange-600 hover:bg-orange-50"
                      >
                        <Edit3 className="h-4 w-4 mr-1" />
                        Amend
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {conversions?.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            No conversions found for the selected period.
          </div>
        )}
      </DialogContent>

      <AmendConversionForm
        open={amendDialog.open}
        onOpenChange={(open) => !open && setAmendDialog({ open: false, conversion: null })}
        conversion={amendDialog.conversion}
        onAmendComplete={() => {
          setAmendDialog({ open: false, conversion: null });
          refetch();
        }}
      />
    </Dialog>
  );
};
