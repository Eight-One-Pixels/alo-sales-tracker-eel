import { useState } from "react";
import { useConversions, useUserRole, useConversionActions, useEnrichedConversions } from "@/hooks/useConversions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ValidatedTextarea } from "@/components/ui/validated-inputs";
import { validationRules, useFormValidation } from "@/components/ui/form-validation";
import { AmendConversionForm } from "@/components/forms/AmendConversionForm";
import { CheckCircle, XCircle, Clock, AlertTriangle, Eye, Edit3 } from "lucide-react";
import { showSuccessToast, showErrorToast } from "@/components/notifications/NotificationToast";
import type { Database } from "@/integrations/supabase/types";

type ConversionStatus = Database["public"]["Enums"]["conversion_status"];

interface ConversionItemProps {
  conversion: any;
  userRole: any;
  onAction: (action: string, conversionId: string, data?: any) => void;
}

const ConversionItem = ({ conversion, userRole, onAction }: ConversionItemProps) => {
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

  const canRecommend = userRole?.canRecommend && conversion.status === "pending";
  const canApprove = userRole?.canApprove && conversion.status === "recommended";
  const canAmend = conversion.status === "rejected" && (
    userRole?.canRecommend || userRole?.canApprove || conversion.rep_id === userRole?.user_id
  );

  const getApprovalStatusBadge = () => {
    if (conversion.status === "approved") {
      // Check if it's an auto-approved conversion (zero commission)
      const isAutoApproved = conversion.workflow_notes?.includes('Auto-approved: Zero commission');
      if (isAutoApproved) {
        return <Badge className="bg-blue-100 text-blue-800 ml-2">🤖 Auto-Approved (Zero Commission)</Badge>;
      }
      return <Badge className="bg-green-100 text-green-800 ml-2">✅ Approved</Badge>;
    } else if (conversion.status === "rejected") {
      return <Badge className="bg-red-100 text-red-800 ml-2">❌ Rejected</Badge>;
    }
    return null;
  };

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between">
        <div className="space-y-3 flex-1">
          <div className="flex items-center gap-3">
            <h3 className="font-semibold text-lg">{conversion.leads?.company_name || 'Unknown Company'}</h3>
            <Badge className={`flex items-center gap-1 ${getStatusColor(conversion.status)}`}>
              {getStatusIcon(conversion.status)}
              {conversion.status?.replace('_', ' ').toUpperCase() || 'PENDING'}
            </Badge>
            {/* {getApprovalStatusBadge()} */}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-600">Contact: {conversion.leads?.contact_name || 'N/A'}</p>
              <p className="text-sm text-gray-600">Rep: {conversion.profiles?.full_name || 'N/A'}</p>
              <p className="text-sm text-gray-600">
                Date: {conversion.conversion_date ? new Date(conversion.conversion_date).toLocaleDateString() : 'N/A'}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">
                Revenue: {conversion.currency || 'USD'} {conversion.revenue_amount?.toLocaleString() || '0'}
              </p>
              <p className="text-sm text-gray-600">
                Commission: {conversion.currency || 'USD'} {conversion.commission_amount?.toLocaleString() || '0'}
                {conversion.status === 'approved' && <span className="text-green-600 ml-1">✓</span>}
                {conversion.status === 'rejected' && <span className="text-red-600 ml-1">✗</span>}
              </p>
              <p className="text-sm text-gray-600">Rate: {conversion.commission_rate || '0'}%</p>
            </div>
          </div>

          {conversion.notes && (
            <div className="bg-gray-50 p-3 rounded">
              <p className="text-sm font-medium text-gray-700">Notes:</p>
              <p className="text-sm text-gray-600">{conversion.notes}</p>
            </div>
          )}

          {conversion.workflow_notes && (
            <div className="bg-blue-50 p-3 rounded">
              <p className="text-sm font-medium text-blue-700">Workflow Notes:</p>
              <p className="text-sm text-blue-600">{conversion.workflow_notes}</p>
            </div>
          )}

          {conversion.rejection_reason && (
            <div className="bg-red-50 p-3 rounded">
              <p className="text-sm font-medium text-red-700">Rejection Reason:</p>
              <p className="text-sm text-red-600">{conversion.rejection_reason}</p>
            </div>
          )}

          {/* Show workflow history */}
          <div className="text-xs text-gray-500 space-y-1">
            {conversion.submitted_at && (
              <p>Submitted: {new Date(conversion.submitted_at).toLocaleString()}</p>
            )}
            {conversion.recommended_at && conversion.recommended_profile && (
              <p>Recommended by {conversion.recommended_profile.full_name}: {new Date(conversion.recommended_at).toLocaleString()}</p>
            )}
            {conversion.approved_at && conversion.approved_profile && (
              <p>
                {conversion.status === 'approved' ? 'Approved' : 'Rejected'} by {conversion.approved_profile.full_name}: {new Date(conversion.approved_at).toLocaleString()}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2 ml-4">
          {canRecommend && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onAction("recommend", conversion.id)}
              className="text-blue-600 border-blue-600 hover:bg-blue-50"
            >
              Recommend
            </Button>
          )}
          {canApprove && (
            <>
              <Button
                size="sm"
                onClick={() => onAction("approve", conversion.id)}
                className="bg-green-600 hover:bg-green-700"
              >
                Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onAction("reject", conversion.id)}
                className="text-red-600 border-red-600 hover:bg-red-50"
              >
                Reject
              </Button>
            </>
          )}
          {canAmend && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onAction("amend", conversion.id)}
              className="text-orange-600 border-orange-600 hover:bg-orange-50"
            >
              <Edit3 className="h-4 w-4 mr-1" />
              Amend
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
};

export const ConversionsManagement = () => {
  const { data: conversions, isLoading: baseLoading, error: baseError, refetch: baseRefetch } = useConversions();
  const { data: enrichedConversions, isLoading: enrichLoading, error: enrichError, refetch: enrichRefetch } = useEnrichedConversions();
  const { data: userRole } = useUserRole();
  const { recommendConversion, approveConversion, rejectConversion } = useConversionActions();
  
  // Use enriched data if available, fallback to base conversions
  const displayConversions = enrichedConversions || conversions;
  const isLoading = baseLoading || enrichLoading;
  const error = baseError || enrichError;
  const refetch = () => {
    baseRefetch();
    enrichRefetch();
  };
  
  const [actionDialog, setActionDialog] = useState<{
    open: boolean;
    action: string;
    conversionId: string;
  }>({ open: false, action: "", conversionId: "" });

  const [amendDialog, setAmendDialog] = useState<{
    open: boolean;
    conversion: any;
  }>({ open: false, conversion: null });

  const validationSchema = {
    notes: [validationRules.maxLength(500)],
    rejectionReason: [
      validationRules.required("Rejection reason is required"),
      validationRules.maxLength(500)
    ]
  };

  const {
    values,
    errors,
    setValue,
    setTouched,
    validateForm
  } = useFormValidation(
    {
      notes: "",
      rejectionReason: ""
    },
    validationSchema
  );

  const resetForm = () => {
    setValue("notes", "");
    setValue("rejectionReason", "");
  };

  const handleAction = (action: string, conversionId: string) => {
    if (action === "amend") {
      const conversion = displayConversions?.find(c => c.id === conversionId);
      if (conversion) {
        setAmendDialog({ open: true, conversion });
      }
    } else {
      setActionDialog({ open: true, action, conversionId });
      resetForm();
    }
  };

  const handleConfirmAction = async () => {
    try {
      const { action, conversionId } = actionDialog;
      
      if (action === "recommend") {
        await recommendConversion({ conversionId, notes: values.notes });
      } else if (action === "approve") {
        await approveConversion({ conversionId, notes: values.notes });
      } else if (action === "reject") {
        if (!validateForm()) {
          showErrorToast("Please provide a rejection reason");
          return;
        }
        await rejectConversion({ 
          conversionId, 
          rejectionReason: values.rejectionReason, 
          notes: values.notes 
        });
      }

      setActionDialog({ open: false, action: "", conversionId: "" });
      resetForm();
      refetch();
    } catch (error) {
      console.error("Error performing action:", error);
      showErrorToast("Failed to perform action");
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <Card key={i} className="p-6">
            <div className="animate-pulse space-y-3">
              <div className="h-6 bg-gray-200 rounded w-1/3"></div>
              <div className="h-4 bg-gray-200 rounded w-1/2"></div>
              <div className="h-4 bg-gray-200 rounded w-2/3"></div>
            </div>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card className="p-8 text-center">
        <p className="text-red-500">Error loading conversions: {error instanceof Error ? error.message : 'Unknown error'}</p>
        <Button 
          onClick={() => refetch()} 
          className="mt-4"
          variant="outline"
        >
          Try Again
        </Button>
      </Card>
    );
  }

  if (!displayConversions?.length) {
    return (
      <Card className="p-8 text-center">
        <div className="space-y-2">
          <p className="text-gray-500">No conversions found for your role.</p>
          <p className="text-sm text-gray-400">
            Role: {userRole?.role || 'loading...'} | 
            Data loaded: {displayConversions ? 'Yes' : 'No'} | 
            Count: {displayConversions?.length || 0}
          </p>
          <Button 
            onClick={() => refetch()} 
            variant="outline"
            size="sm"
            className="mt-2"
          >
            Refresh
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">
          {userRole?.role === 'rep' ? 'My Conversions' : 'Conversions Management'}
        </h2>
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <span>Role: </span>
          <Badge variant="outline">{userRole?.role}</Badge>
        </div>
      </div>

      <div className="space-y-4">
        {displayConversions.map((conversion) => (
          <ConversionItem
            key={conversion.id}
            conversion={conversion}
            userRole={userRole}
            onAction={handleAction}
          />
        ))}
      </div>

      <Dialog open={actionDialog.open} onOpenChange={(open) => !open && setActionDialog({ open: false, action: "", conversionId: "" })}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {actionDialog.action === "recommend" && "Recommend Conversion"}
              {actionDialog.action === "approve" && "Approve Conversion"}
              {actionDialog.action === "reject" && "Reject Conversion"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {actionDialog.action === "reject" && (
              <ValidatedTextarea
                label="Rejection Reason"
                name="rejectionReason"
                value={values.rejectionReason}
                onValueChange={(value) => setValue("rejectionReason", value)}
                onBlur={() => setTouched("rejectionReason")}
                validationRules={validationSchema.rejectionReason}
                error={errors.rejectionReason?.[0]}
                required
                placeholder="Please provide a reason for rejecting this conversion..."
                rows={3}
              />
            )}

            <ValidatedTextarea
              label={actionDialog.action === "reject" ? "Additional Notes" : "Notes"}
              name="notes"
              value={values.notes}
              onValueChange={(value) => setValue("notes", value)}
              onBlur={() => setTouched("notes")}
              validationRules={validationSchema.notes}
              error={errors.notes?.[0]}
              placeholder="Add any additional notes..."
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialog({ open: false, action: "", conversionId: "" })}>
              Cancel
            </Button>
            <Button 
              onClick={handleConfirmAction}
              className={
                actionDialog.action === "approve" 
                  ? "bg-green-600 hover:bg-green-700"
                  : actionDialog.action === "reject"
                  ? "bg-red-600 hover:bg-red-700"
                  : "bg-blue-600 hover:bg-blue-700"
              }
            >
              {actionDialog.action === "recommend" && "Recommend"}
              {actionDialog.action === "approve" && "Approve"}
              {actionDialog.action === "reject" && "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
