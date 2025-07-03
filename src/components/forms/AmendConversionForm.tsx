import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ValidatedInput, ValidatedTextarea } from "@/components/ui/validated-inputs";
import { validationRules, useFormValidation } from "@/components/ui/form-validation";
import { useConversionActions } from "@/hooks/useConversions";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useQuery as useReactQuery } from "@tanstack/react-query";

interface AmendConversionFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversion?: {
    id: string;
    revenue_amount: number;
    commission_rate: number;
    commission_amount: number;
    commissionable_amount: number;
    currency: string;
    rejection_reason?: string;
  } | null;
  onAmendComplete?: () => void;
}

export const AmendConversionForm = ({ 
  open, 
  onOpenChange, 
  conversion,
  onAmendComplete
}: AmendConversionFormProps) => {
  const { amendConversion, isLoading } = useConversionActions();
  const [commissionData, setCommissionData] = useState<any>(null);
  
  // Define validation schema
  const validationSchema = {
    revenueAmount: [
      validationRules.required("Revenue amount is required"),
      validationRules.numeric("Must be a valid number"),
      validationRules.minValue(0, "Revenue amount cannot be negative")
    ],
    commissionRate: [
      validationRules.required("Commission rate is required"),
      validationRules.numeric("Must be a valid number"),
      validationRules.minValue(0, "Commission rate cannot be negative"),
      validationRules.maxValue(100, "Commission rate cannot exceed 100%")
    ],
    notes: [validationRules.maxLength(500, "Notes cannot exceed 500 characters")]
  };

  // Use the form validation hook with safe defaults
  const {
    values,
    errors,
    setValue,
    setTouched,
    validateForm
  } = useFormValidation(
    {
      revenueAmount: conversion?.revenue_amount?.toString() || "",
      commissionRate: conversion?.commission_rate?.toString() || "",
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
          currency: conversion?.currency || 'USD'
        });
      if (error) throw error;
      return data?.[0] || null;
    },
    enabled: !!values.revenueAmount && !!values.commissionRate && Number.isFinite(parseFloat(values.revenueAmount)) && Number.isFinite(parseFloat(values.commissionRate)) && parseFloat(values.revenueAmount) > 0
  });

  useEffect(() => {
    if (calculationResult) {
      setCommissionData(calculationResult);
    }
  }, [calculationResult]);

  // Handle case where no conversion is provided
  if (!conversion) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Error</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-gray-600">
              No conversion data available. Please try again.
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // Reset form function
  const resetForm = () => {
    if (!conversion) return;
    setValue("revenueAmount", conversion.revenue_amount?.toString() || "");
    setValue("commissionRate", conversion.commission_rate?.toString() || "");
    setValue("notes", "");
    setCommissionData(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!conversion) {
      console.error('No conversion data available for amendment');
      return;
    }
    
    if (!validateForm()) {
      return;
    }

    if (!commissionData) {
      console.error('Commission calculation not available');
      return;
    }

    try {
      await amendConversion({
        conversionId: conversion.id,
        newCommissionRate: parseFloat(values.commissionRate),
        newCommissionAmount: commissionData.final_commission || 0,
        newCommissionableAmount: commissionData.commissionable_amount || parseFloat(values.revenueAmount),
        notes: values.notes
      });

      onOpenChange(false);
      if (onAmendComplete) onAmendComplete();
      resetForm();
    } catch (error) {
      console.error('Error amending conversion:', error);
    }
  };

  const handleCancel = () => {
    onOpenChange(false);
    resetForm();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Amend Conversion Commission</DialogTitle>
          <p className="text-sm text-gray-600">
            Original Revenue: {conversion?.currency || 'USD'} {conversion?.revenue_amount?.toLocaleString() || '0'}
          </p>
          {conversion?.rejection_reason && (
            <div className="bg-red-50 p-3 rounded-md">
              <p className="text-sm font-medium text-red-700">Rejection Reason:</p>
              <p className="text-sm text-red-600">{conversion.rejection_reason}</p>
            </div>
          )}
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {deductionSettings && Array.isArray(deductionSettings) && (
            <Card className="p-4 bg-yellow-50">
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

          <div className="grid grid-cols-1 gap-6">
            <ValidatedInput
              label="Revenue Amount"
              name="revenueAmount"
              type="number"
              step="0.01"
              value={values.revenueAmount}
              onValueChange={(value) => setValue("revenueAmount", value)}
              onBlur={() => setTouched("revenueAmount")}
              validationRules={validationSchema.revenueAmount}
              error={errors.revenueAmount?.[0]}
              required
              placeholder="0.00"
              helpText="The actual revenue amount from this conversion"
            />

            <ValidatedInput
              label="Commission Rate (%)"
              name="commissionRate"
              type="number"
              step="0.01"
              value={values.commissionRate}
              onValueChange={(value) => setValue("commissionRate", value)}
              onBlur={() => setTouched("commissionRate")}
              validationRules={validationSchema.commissionRate}
              error={errors.commissionRate?.[0]}
              required
              placeholder="0.00"
              helpText="Commission rate as a percentage (0-100)"
            />

            {commissionData && (
              <Card className="p-4 bg-blue-50">
                <h4 className="font-medium mb-3">Commission Calculation</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Revenue Amount:</span>
                    <span className="font-medium">{conversion?.currency || 'USD'} {parseFloat(values.revenueAmount || "0").toFixed(2)}</span>
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
                            -{conversion?.currency || 'USD'} {Number.isFinite(Number(deduction.amount)) ? Number(deduction.amount).toFixed(2) : '0.00'}
                          </span>
                        </div>
                      ))}
                    </>
                  )}
                  
                  <div className="flex justify-between border-t pt-2">
                    <span className="font-medium">Commissionable Amount:</span>
                    <span className="font-medium text-green-600">
                      {conversion?.currency || 'USD'} {parseFloat(commissionData.commissionable_amount || "0").toFixed(2)}
                    </span>
                  </div>
                  
                  <div className="flex justify-between">
                    <span className="font-medium">Final Commission ({values.commissionRate}%):</span>
                    <Badge className="bg-green-100 text-green-800">
                      {conversion?.currency || 'USD'} {parseFloat(commissionData.final_commission || "0").toFixed(2)}
                    </Badge>
                  </div>
                </div>
              </Card>
            )}

            <ValidatedTextarea
              label="Amendment Notes"
              name="notes"
              value={values.notes}
              onValueChange={(value) => setValue("notes", value)}
              onBlur={() => setTouched("notes")}
              validationRules={validationSchema.notes}
              error={errors.notes?.[0]}
              placeholder="Explain the reason for amending the commission..."
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={isLoading || !commissionData}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isLoading ? "Amending..." : "Amend & Resubmit"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
