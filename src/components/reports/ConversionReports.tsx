import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ReportFilters } from "./ReportFilters";
import { toast } from "sonner";
import { format } from "date-fns";
import { DollarSign, CheckCircle, XCircle, Clock, AlertTriangle, Edit3 } from "lucide-react";
import { getUserCurrencyContext, convertCurrency } from "@/lib/currency";
import { useConversionActions, useUserRole } from "@/hooks/useConversions";
import { AmendConversionForm } from "@/components/forms/AmendConversionForm";
import { exportBrandedCSV, exportTableToPDF, escapeCSV, formatCurrency } from "@/lib/exportUtils";
import { REPORT_TITLES } from "@/lib/brandingConfig";
import type { Database } from "@/integrations/supabase/types";

type ConversionStatus = Database["public"]["Enums"]["conversion_status"];

export const ConversionReports = () => {
  const { user, userRole } = useAuth();
  const { data: currentUserRole } = useUserRole();
  const { recommendConversion, approveConversion, rejectConversion } = useConversionActions();
  
  const [dateRange, setDateRange] = useState<{
    from: Date | undefined;
    to: Date | undefined;
  }>({
    from: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    to: new Date()
  });

  const [amendDialog, setAmendDialog] = useState<{
    open: boolean;
    conversion: any;
  }>({ open: false, conversion: null });

  const [convertedTotals, setConvertedTotals] = useState<{ 
    revenue: number, 
    commission: number, 
    avgDeal: number, 
    base: string 
  } | null>(null);

  const { data: conversions, isLoading, refetch } = useQuery({
    queryKey: ['conversion-reports', user?.id, userRole, dateRange],
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

      // For reports, show all conversions but indicate approval status
      // Filter by user if not manager/admin
      if (!['manager', 'director', 'admin'].includes(userRole || '')) {
        query = query.eq('rep_id', user.id);
      }

      // Apply date filter
      if (dateRange.from) {
        query = query.gte('conversion_date', dateRange.from.toISOString().split('T')[0]);
      }
      if (dateRange.to) {
        query = query.lte('conversion_date', dateRange.to.toISOString().split('T')[0]);
      }

      const { data, error } = await query.order('conversion_date', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user
  });

  useEffect(() => {
    async function convertAll() {
      if (!user || !conversions) return;
      const { base } = await getUserCurrencyContext(user);
      
      // Only include approved conversions in totals calculations
      const approvedConversions = conversions.filter(conv => conv.status === 'approved');
      
      let revenue = 0;
      let commission = 0;
      let avgDeal = 0;
      if (approvedConversions.length > 0) {
        const revenueArr = await Promise.all(
          approvedConversions.map(async (conv) => {
            const amount = Number(conv.revenue_amount) || 0;
            const fromCurrency = conv.currency || 'USD';
            try {
              return await convertCurrency(amount, fromCurrency, base);
            } catch {
              return amount;
            }
          })
        );
        revenue = revenueArr.reduce((sum, val) => sum + val, 0);
        const commissionArr = await Promise.all(
          approvedConversions.map(async (conv) => {
            const amount = Number(conv.commission_amount) || 0;
            const fromCurrency = conv.currency || 'USD';
            try {
              return await convertCurrency(amount, fromCurrency, base);
            } catch {
              return amount;
            }
          })
        );
        commission = commissionArr.reduce((sum, val) => sum + val, 0);
        avgDeal = approvedConversions.length ? revenue / approvedConversions.length : 0;
      }
      setConvertedTotals({ revenue, commission, avgDeal, base });
    }
    convertAll();
  }, [user, conversions]);

  const exportReport = () => {
    if (!conversions || conversions.length === 0) {
      toast.error("No data to export");
      return;
    }

    const csvData = conversions.map(conv => [
      format(new Date(conv.conversion_date), 'yyyy-MM-dd'),
      escapeCSV(conv.leads?.company_name || 'N/A'),
      escapeCSV(conv.leads?.contact_name || 'N/A'),
      escapeCSV(conv.leads?.source || 'N/A'),
      formatCurrency(conv.revenue_amount, conv.currency),
      conv.commission_amount || 0,
      escapeCSV(conv.status || 'pending'),
      escapeCSV(conv.profiles?.full_name || conv.profiles?.email || 'Unknown'),
      escapeCSV(conv.notes || '')
    ].join(','));

    exportBrandedCSV(
      csvData,
      ['Date', 'Company', 'Contact', 'Source', 'Revenue', 'Commission', 'Status', 'Rep', 'Notes'],
      'conversion-report',
      REPORT_TITLES.conversions,
      dateRange
    );
  };

  const exportReportPDF = async () => {
    await exportTableToPDF(
      'conversions-table',
      'conversion-report',
      REPORT_TITLES.conversions,
      dateRange
    );
  };

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

  // Calculate totals for display (only approved conversions count)
  const approvedConversions = conversions?.filter(conv => conv.status === 'approved') || [];
  const totalRevenue = approvedConversions.reduce((sum, conv) => 
    sum + Number(conv.revenue_amount), 0
  ) || 0;

  const totalCommission = approvedConversions.reduce((sum, conv) => 
    sum + (Number(conv.commission_amount) || 0), 0
  ) || 0;

  const avgDealSize = approvedConversions.length ? totalRevenue / approvedConversions.length : 0;

  return (
    <div className="space-y-6">
      <ReportFilters
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        onExport={exportReport}
        onExportPDF={exportReportPDF}
        exportLabel="Export Conversion Report"
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-2xl font-bold">{conversions?.length || 0}</div>
          <div className="text-sm text-gray-600">Total Conversions</div>
          <div className="text-xs text-gray-500 mt-1">
            {approvedConversions.length} approved
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold">
            {convertedTotals ? `${convertedTotals.base} ${convertedTotals.revenue.toLocaleString()}` : '...'}
          </div>
          <div className="text-sm text-gray-600">Approved Revenue</div>
          <div className="text-xs text-gray-500 mt-1">
            Only approved conversions counted
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold">
            {convertedTotals ? `${convertedTotals.base} ${convertedTotals.commission.toLocaleString()}` : '...'}
          </div>
          <div className="text-sm text-gray-600">Approved Commission</div>
          <div className="text-xs text-gray-500 mt-1">
            Only approved conversions counted
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold">
            {convertedTotals ? `${convertedTotals.base} ${convertedTotals.avgDeal.toLocaleString()}` : '...'}
          </div>
          <div className="text-sm text-gray-600">Avg Deal Size (Approved)</div>
          <div className="text-xs text-gray-500 mt-1">
            Based on approved conversions
          </div>
        </Card>
      </div>

      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Conversion Details</h3>
        {isLoading ? (
          <div className="flex items-center justify-center h-64">Loading...</div>
        ) : (
          <div className="overflow-x-auto" id="conversions-table">
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
                  <TableHead>Rep</TableHead>
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
                          {conversion.currency} {Number(conversion.revenue_amount).toLocaleString()}
                        </span>
                        {conversion.status === 'approved' && <CheckCircle className="h-4 w-4 text-green-500" />}
                        {conversion.status === 'rejected' && <XCircle className="h-4 w-4 text-red-500" />}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-semibold text-blue-600">
                        {conversion.currency} {Number(conversion.commissionable_amount || conversion.revenue_amount).toLocaleString()}
                      </span>
                    </TableCell>
                    <TableCell>
                      {conversion.commission_amount ? (
                        <div className="flex items-center gap-1">
                          <div>
                            <span className="font-medium">
                              {conversion.currency} {Number(conversion.commission_amount).toLocaleString()}
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
                    <TableCell>
                      <span className="text-sm text-gray-600">
                        {conversion.profiles?.full_name || conversion.profiles?.email || 'Unknown'}
                      </span>
                    </TableCell>
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
        )}
      </Card>

      <AmendConversionForm
        open={amendDialog.open}
        onOpenChange={(open) => !open && setAmendDialog({ open: false, conversion: null })}
        conversion={amendDialog.conversion}
        onAmendComplete={() => {
          setAmendDialog({ open: false, conversion: null });
          refetch();
        }}
      />
    </div>
  );
};
