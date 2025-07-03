import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ArrowLeft, DollarSign, TrendingUp, Calendar, CheckCircle, XCircle, Clock, AlertTriangle, Edit3 } from "lucide-react";
import { getUserCurrencyContext, convertCurrency } from "@/lib/currency";
import { useEffect, useState } from "react";
import { useUserRole } from "@/hooks/useConversions";
import { AmendConversionForm } from "@/components/forms/AmendConversionForm";
import type { Database } from "@/integrations/supabase/types";

type ConversionStatus = Database["public"]["Enums"]["conversion_status"];

interface ConversionsDetailPageProps {
  onBack: () => void;
}

export const ConversionsDetailPage = ({ onBack }: ConversionsDetailPageProps) => {
  const { user } = useAuth();
  const { data: userRole } = useUserRole();
  
  const [amendDialog, setAmendDialog] = useState<{
    open: boolean;
    conversion: any;
  }>({ open: false, conversion: null });

  const { data: conversions, isLoading, refetch } = useQuery({
    queryKey: ['user-conversions', user?.id],
    queryFn: async () => {
      if (!user) return [];
      
      const { data, error } = await supabase
        .from('conversions')
        .select(`
          *,
          leads (
            company_name,
            contact_name,
            source
          )
        `)
        .eq('rep_id', user.id)
        .order('conversion_date', { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!user
  });

  // Currency conversion logic - only include approved conversions for totals
  const [convertedTotals, setConvertedTotals] = useState<{ revenue: number, commission: number, base: string } | null>(null);
  useEffect(() => {
    async function convertAll() {
      if (!user || !conversions) return;
      const { base } = await getUserCurrencyContext(user);
      
      // Only include approved conversions in totals
      const approvedConversions = conversions.filter(conv => conv.status === 'approved');
      
      let revenue = 0;
      let commission = 0;
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
      }
      setConvertedTotals({ revenue, commission, base });
    }
    convertAll();
  }, [user, conversions]);

  if (isLoading) {
    return <div className="flex items-center justify-center h-64">Loading...</div>;
  }

  const totalRevenue = conversions?.reduce((sum, conv) => sum + Number(conv.revenue_amount), 0) || 0;
  const totalCommission = conversions?.reduce((sum, conv) => sum + (Number(conv.commission_amount) || 0), 0) || 0;

  // Map conversions to include parsed deductions
  const conversionsWithDeductions = conversions?.map((conv) => ({
    ...conv,
    deductions: (() => {
      try {
        if (Array.isArray(conv.deductions_applied)) return conv.deductions_applied;
        if (typeof conv.deductions_applied === "string") return JSON.parse(conv.deductions_applied);
        return [];
      } catch {
        return [];
      }
    })(),
  }));

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

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={onBack} className="flex items-center gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Button>
        <h1 className="text-2xl font-bold">All Conversions</h1>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Total Conversions Card */}
        <Card className="p-4">
          <div className="flex items-center gap-3">
        <div className="p-2 bg-green-100 rounded-lg">
          <TrendingUp className="h-5 w-5 text-green-600" />
        </div>
        <div>
          <p className="text-sm text-gray-600">Total Conversions</p>
          {isLoading ? (
            <div className="h-7 w-20 bg-gray-200 rounded animate-pulse" />
          ) : (
            <div>
              <p className="text-2xl font-bold">{conversions?.length || 0}</p>
              <p className="text-xs text-gray-500 mt-1">
                {conversions?.filter(c => c.status === 'approved').length || 0} approved
              </p>
            </div>
          )}
        </div>
          </div>
        </Card>

        {/* Total Revenue Card */}
        <Card className="p-4">
          <div className="flex items-center gap-3">
        <div className="p-2 bg-blue-100 rounded-lg">
          <DollarSign className="h-5 w-5 text-blue-600" />
        </div>
        <div>
          <p className="text-sm text-gray-600">Approved Revenue</p>
          {isLoading || !convertedTotals ? (
            <div className="h-7 w-32 bg-gray-200 rounded animate-pulse" />
          ) : (
            <div>
              <p className="text-2xl font-bold">
                {convertedTotals.base} {convertedTotals.revenue.toLocaleString()}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Only approved conversions counted
              </p>
            </div>
          )}
        </div>
          </div>
        </Card>

        {/* Total Commission Card */}
        <Card className="p-4">
          <div className="flex items-center gap-3">
        <div className="p-2 bg-purple-100 rounded-lg">
          <TrendingUp className="h-5 w-5 text-purple-600" />
        </div>
        <div>
          <p className="text-sm text-gray-600">Approved Commission</p>
          {isLoading || !convertedTotals ? (
            <div className="h-7 w-32 bg-gray-200 rounded animate-pulse" />
          ) : (
            <div>
              <p className="text-2xl font-bold">
                {convertedTotals.base} {convertedTotals.commission.toLocaleString()}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Only approved conversions counted
              </p>
            </div>
          )}
        </div>
          </div>
        </Card>
      </div>

      <Card className="p-6">
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
                <TableHead>Notes</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {conversionsWithDeductions?.map((conversion) => (
                <TableRow key={conversion.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-gray-500" />
                      {new Date(conversion.conversion_date).toLocaleDateString()}
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">
                    {conversion.leads?.company_name || 'N/A'}
                  </TableCell>
                  <TableCell>
                    {conversion.leads?.contact_name || 'N/A'}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {conversion.leads?.source || 'N/A'}
                    </Badge>
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
                    <div className="flex flex-col">
                      <span className="font-semibold text-blue-700">
                        {conversion.currency} {Number(conversion.commissionable_amount ?? conversion.revenue_amount).toLocaleString()}
                      </span>
                      {conversion.deductions && Array.isArray(conversion.deductions) && conversion.deductions.length > 0 && (
                        <span className="text-xs text-gray-500 mt-1">
                          Deductions: {conversion.deductions.map((d) => `${d.label || d.type}: ${conversion.currency} ${Number(d.amount).toLocaleString()}`).join(', ')}
                        </span>
                      )}
                    </div>
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

        {conversionsWithDeductions?.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <p>No conversions recorded yet.</p>
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
