import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ValidatedInput, ValidatedTextarea } from "@/components/ui/validated-inputs";
import { validationRules, useFormValidation } from "@/components/ui/form-validation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole, useConversionActions } from "@/hooks/useConversions";
import { useQuery as useReactQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { showSuccessToast, showErrorToast } from "@/components/notifications/NotificationToast";

interface ConvertLeadFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string;
  leadData?: any;
  onConversionComplete?: () => void;
}

export const ConvertLeadForm = ({ 
  open, 
  onOpenChange, 
  leadId, 
  leadData, 
  onConversionComplete 
}: ConvertLeadFormProps) => {
  const { user } = useAuth();
  const { data: userRole } = useUserRole();
  const { submitConversion } = useConversionActions();
  const [loading, setLoading] = useState(false);
  const [commissionData, setCommissionData] = useState<any>(null);

  // Define validation schema
  const validationSchema = {
    revenueAmount: [
      validationRules.required("Revenue amount is required"),
      validationRules.currency(),
      validationRules.positiveNumber("Revenue must be greater than 0")
    ],
    commissionRate: [
      validationRules.required("Commission rate is required"),
      validationRules.percentage(),
      validationRules.minValue(0, "Commission rate cannot be negative"),
      validationRules.maxValue(100, "Commission rate cannot exceed 100%")
    ],
    conversionDate: [
      validationRules.required("Conversion date is required"),
      validationRules.date()
    ],
    notes: [validationRules.maxLength(1000)]
  };

  // Use the form validation hook
  const {
    values,
    errors,
    setValue,
    setTouched,
    validateForm,
    hasErrors
  } = useFormValidation(
    {
      revenueAmount: "",
      commissionRate: "10",
      conversionDate: new Date().toISOString().split("T")[0],
      notes: ""
    },
    validationSchema
  );

  // Fetch deduction settings (for display purposes)
  const { data: deductionSettings, isLoading: deductionsLoading } = useReactQuery({
    queryKey: ['deduction-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deductions')
        .select('*')
        .eq('is_active', true); // Only fetch active deductions
      if (error) throw error;
      return data;
    },
    enabled: open
  });

  // Fetch commission calculation when revenue or rate changes
  const { data: calculationResult, refetch: recalculate } = useReactQuery({
    queryKey: ['commission-calculation', values.revenueAmount, values.commissionRate],
    queryFn: async () => {
      if (!values.revenueAmount || !values.commissionRate || !Number.isFinite(parseFloat(values.revenueAmount)) || !Number.isFinite(parseFloat(values.commissionRate))) return null;
      
      const { data, error } = await supabase
        .rpc('calculate_commission_with_deductions', {
          revenue_amount: parseFloat(values.revenueAmount),
          commission_rate: parseFloat(values.commissionRate),
          currency: leadData?.currency || 'USD'
        });
      if (error) throw error;
      return data?.[0] || null;
    },
    enabled: !!values.revenueAmount && !!values.commissionRate && Number.isFinite(parseFloat(values.revenueAmount)) && Number.isFinite(parseFloat(values.commissionRate)) && parseFloat(values.revenueAmount) > 0
  });

  // Fetch user's default commission rate
  useReactQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from('profiles')
        .select('default_commission_rate')
        .eq('id', user.id)
        .single();
      return data;
    },
    enabled: !!user?.id && open,
    onSuccess: (data) => {
      if (data?.default_commission_rate !== undefined && data?.default_commission_rate !== null) {
        setValue('commissionRate', String(data.default_commission_rate));
      }
    }
  });

  useEffect(() => {
    if (calculationResult) {
      setCommissionData(calculationResult);
    }
  }, [calculationResult]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !leadId) return;

    if (!validateForm()) {
      toast.error('Please fix the errors before submitting');
      return;
    }

    setLoading(true);
    try {
      const conversionData = {
        lead_id: leadId,
        revenue_amount: parseFloat(values.revenueAmount),
        commission_rate: parseFloat(values.commissionRate),
        commission_amount: commissionData?.final_commission || 0,
        commissionable_amount: commissionData?.commissionable_amount || parseFloat(values.revenueAmount),
        deductions_applied: commissionData?.deductions_applied || [],
        conversion_date: values.conversionDate,
        currency: leadData?.currency || 'USD',
        notes: values.notes
      };

      // Use the new submission workflow
      await submitConversion(conversionData);

      // Update lead status to closed_won
      const { error: leadError } = await supabase
        .from('leads')
        .update({ status: 'closed_won' })
        .eq('id', leadId);

      if (leadError) throw leadError;

      const roleText = userRole?.role === 'rep' 
        ? 'Lead submitted for recommendation and approval!' 
        : 'Lead converted successfully!';
      
      showSuccessToast(roleText);
      onOpenChange(false);
      if (onConversionComplete) onConversionComplete();
      
      // Reset form
      resetForm();
    } catch (error) {
      console.error('Error converting lead:', error);
      showErrorToast('Failed to convert lead');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setValue('revenueAmount', '');
    setValue('commissionRate', '10');
    setValue('conversionDate', new Date().toISOString().split("T")[0]);
    setValue('notes', '');
    setCommissionData(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Convert Lead to Sale</DialogTitle>
        </DialogHeader>
        
        {leadData && (
          <Card className="p-4 bg-gray-50">
            <div className="space-y-2">
              <h4 className="font-medium">{leadData.company_name}</h4>
              <p className="text-sm text-gray-600">Contact: {leadData.contact_name}</p>
              <p className="text-sm text-gray-600">
                Estimated Revenue: {leadData.currency} {leadData.estimated_revenue || 0}
              </p>
            </div>
          </Card>
        )}

        
        {deductionSettings && Array.isArray(deductionSettings) && (
          <Card className="p-4 bg-yellow-50 mb-2">
            <h4 className="font-medium mb-2">Deductions</h4>
            {deductionSettings.length > 0 ? (
              <ul className="list-disc ml-5 text-sm">
                {deductionSettings.map((d: any, idx: number) => (
                  <li key={idx} className="mb-1">
                    <span className="font-semibold">{d.label}</span>: {d.percentage}%
                  </li>
                ))}
              </ul>
            ) : (
              <span className="text-gray-500 text-sm">No deductions configured.</span>
            )}
          </Card>
        )}
        

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ValidatedInput
              label="Actual Revenue Amount"
              name="revenueAmount"
              type="number"
              step="0.01"
              min="0"
              value={values.revenueAmount}
              onValueChange={(value) => setValue("revenueAmount", value)}
              onBlur={() => setTouched("revenueAmount")}
              validationRules={validationSchema.revenueAmount}
              error={errors.revenueAmount?.[0]}
              required
              helpText="The actual revenue amount from this conversion"
              placeholder="0.00"
            />

            <ValidatedInput
              label="Commission Rate (%)"
              name="commissionRate"
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={values.commissionRate}
              onValueChange={(value) => setValue("commissionRate", value)}
              onBlur={() => setTouched("commissionRate")}
              validationRules={validationSchema.commissionRate}
              error={errors.commissionRate?.[0]}
              required
              helpText="Commission rate as a percentage (0-100)"
            />
          </div>

          {commissionData && (
            <Card className="p-4 bg-blue-50">
              <h4 className="font-medium mb-3">Commission Calculation</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Revenue Amount:</span>
                  <span className="font-medium">{leadData?.currency || 'USD'} {parseFloat(values.revenueAmount).toFixed(2)}</span>
                </div>
                
                {commissionData.deductions_applied && commissionData.deductions_applied.length > 0 && (
                  <>
                    <div className="border-t pt-2">
                      <span className="font-medium text-gray-700">Deductions Applied:</span>
                    </div>
                    {commissionData.deductions_applied.map((deduction: any, index: number) => (
                      <div key={index} className="flex justify-between text-gray-600 ml-2">
                        <span>{deduction.label} ({deduction.percentage}%):</span>
                        <span>
                          -{leadData?.currency || 'USD'} {Number.isFinite(Number(deduction.amount)) ? Number(deduction.amount).toFixed(2) : '0.00'}
                        </span>
                      </div>
                    ))}
                  </>
                )}
                
                <div className="flex justify-between border-t pt-2">
                  <span className="font-medium">Commissionable Amount:</span>
                  <span className="font-medium text-green-600">
                    {leadData?.currency || 'USD'} {parseFloat(commissionData.commissionable_amount).toFixed(2)}
                  </span>
                </div>
                
                <div className="flex justify-between">
                  <span className="font-medium">Final Commission ({values.commissionRate}%):</span>
                  <Badge className="bg-green-100 text-green-800">
                    {leadData?.currency || 'USD'} {parseFloat(commissionData.final_commission).toFixed(2)}
                  </Badge>
                </div>
              </div>
            </Card>
          )}

          <ValidatedInput
            label="Conversion Date"
            name="conversionDate"
            type="date"
            value={values.conversionDate}
            onValueChange={(value) => setValue("conversionDate", value)}
            onBlur={() => setTouched("conversionDate")}
            validationRules={validationSchema.conversionDate}
            error={errors.conversionDate?.[0]}
            required
            helpText="Date when the conversion occurred"
          />

          <ValidatedTextarea
            label="Notes"
            name="notes"
            value={values.notes}
            onValueChange={(value) => setValue("notes", value)}
            onBlur={() => setTouched("notes")}
            validationRules={validationSchema.notes}
            error={errors.notes?.[0]}
            helpText="Additional notes about this conversion"
            placeholder="Any additional notes about this conversion..."
            rows={3}
          />

          <div className="flex justify-end space-x-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !commissionData || hasErrors}>
              {loading 
                ? "Submitting..." 
                : userRole?.role === 'rep' 
                  ? "Submit for Approval"
                  : "Convert Lead"
              }
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
