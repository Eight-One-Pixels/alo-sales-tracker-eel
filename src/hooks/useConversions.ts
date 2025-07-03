import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { showSuccessToast, showErrorToast } from "@/components/notifications/NotificationToast";
import { toast } from "sonner";

// Hook to get user role and permissions
export const useUserRole = () => {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['user-role', user?.id],
    queryFn: async () => {
      if (!user) return null;
      
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .single();
      
      if (error) throw error;
      
      const role = data?.role || 'rep';
      
      return {
        role,
        canRecommend: role === 'manager' || role === 'admin',
        canApprove: role === 'director' || role === 'admin',
        canSubmit: role === 'rep' || role === 'manager' || role === 'director' || role === 'admin'
      };
    },
    enabled: !!user
  });
};

// Hook to get conversions for approval workflow
export const useConversions = () => {
  const { user } = useAuth();
  const { data: userRole } = useUserRole();
  
  return useQuery({
    queryKey: ['conversions-workflow', user?.id, userRole?.role],
    queryFn: async () => {
      if (!user) return [];
      
      let query = supabase
        .from('conversions')
        .select('*')
        .order('created_at', { ascending: false });

      // Filter based on user role
      if (userRole?.role === 'rep') {
        // Reps see their own conversions (all statuses)
        query = query.eq('rep_id', user.id);
      } else if (userRole?.role === 'manager') {
        // Managers see pending conversions + rejected conversions they can amend
        query = query.in('status', ['pending', 'rejected']);
      } else if (userRole?.role === 'director') {
        // Directors see recommended conversions + rejected conversions they can amend
        query = query.in('status', ['recommended', 'rejected']);
      } else if (userRole?.role === 'admin') {
        // Admins see all conversions
        // No additional filtering needed
      }
      
      const { data, error } = await query;
      if (error) {
        console.error('Error fetching conversions:', error);
        throw error;
      }
      
      return data || [];
    },
    enabled: !!user && !!userRole?.role
  });
};

// Hook for conversion workflow actions
export const useConversionActions = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  const submitConversion = useMutation({
    mutationFn: async (conversionData: any) => {
      if (!user) throw new Error('User not authenticated');
      
      // Check if commission rate is zero - if so, auto-approve
      const commissionRate = Number(conversionData.commission_rate) || 0;
      const isZeroCommission = commissionRate === 0;
      
      const { error } = await supabase
        .from('conversions')
        .insert({
          ...conversionData,
          rep_id: user.id,
          submitted_by: user.id,
          submitted_at: new Date().toISOString(),
          status: isZeroCommission ? 'approved' : 'pending',
          // If auto-approved, set approval fields
          ...(isZeroCommission && {
            approved_by: user.id,
            approved_at: new Date().toISOString(),
            workflow_notes: 'Auto-approved: Zero commission conversion'
          })
        });
      
      if (error) throw error;
      
      // Send appropriate toast notification
      if (isZeroCommission) {
        showSuccessToast("Conversion auto-approved (zero commission)!");
        toast.success("No approval needed for zero commission conversions");
      } else {
        showSuccessToast("Conversion submitted for approval!");
        toast.success("Managers and directors have been notified of your submission");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversions-workflow'] });
    },
    onError: (error) => {
      console.error('Error submitting conversion:', error);
      showErrorToast("Failed to submit conversion");
    }
  });

  const recommendConversion = useMutation({
    mutationFn: async ({ conversionId, notes }: { conversionId: string; notes?: string }) => {
      if (!user) throw new Error('User not authenticated');
      
      const { error } = await supabase
        .from('conversions')
        .update({
          status: 'recommended',
          recommended_by: user.id,
          recommended_at: new Date().toISOString(),
          workflow_notes: notes
        })
        .eq('id', conversionId);
      
      if (error) throw error;
      
      showSuccessToast("Conversion recommended for approval!");
      toast.success("Directors have been notified of your recommendation");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversions-workflow'] });
    },
    onError: (error) => {
      console.error('Error recommending conversion:', error);
      showErrorToast("Failed to recommend conversion");
    }
  });

  const approveConversion = useMutation({
    mutationFn: async ({ conversionId, notes }: { conversionId: string; notes?: string }) => {
      if (!user) throw new Error('User not authenticated');
      
      const { error } = await supabase
        .from('conversions')
        .update({
          status: 'approved',
          approved_by: user.id,
          approved_at: new Date().toISOString(),
          workflow_notes: notes
        })
        .eq('id', conversionId);
      
      if (error) throw error;
      
      showSuccessToast("Conversion approved!");
      toast.success("Rep will be notified of the approval");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversions-workflow'] });
      queryClient.invalidateQueries({ queryKey: ['pending-conversions-count'] });
    },
    onError: (error) => {
      console.error('Error approving conversion:', error);
      showErrorToast("Failed to approve conversion");
    }
  });

  const rejectConversion = useMutation({
    mutationFn: async ({ 
      conversionId, 
      rejectionReason, 
      notes 
    }: { 
      conversionId: string; 
      rejectionReason: string; 
      notes?: string 
    }) => {
      if (!user) throw new Error('User not authenticated');
      
      const { error } = await supabase
        .from('conversions')
        .update({
          status: 'rejected',
          approved_by: user.id, // Track who rejected it
          approved_at: new Date().toISOString(),
          rejection_reason: rejectionReason,
          workflow_notes: notes
        })
        .eq('id', conversionId);
      
      if (error) throw error;
      
      showSuccessToast("Conversion rejected");
      toast.success("Rep will be notified of the rejection and can amend the commission");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversions-workflow'] });
    },
    onError: (error) => {
      console.error('Error rejecting conversion:', error);
      showErrorToast("Failed to reject conversion");
    }
  });

  const amendConversion = useMutation({
    mutationFn: async ({ 
      conversionId, 
      newCommissionRate, 
      newCommissionAmount,
      newCommissionableAmount,
      notes 
    }: { 
      conversionId: string; 
      newCommissionRate: number;
      newCommissionAmount: number;
      newCommissionableAmount: number;
      notes?: string 
    }) => {
      if (!user) throw new Error('User not authenticated');
      
      // Check if the new commission rate is zero - if so, auto-approve
      const isZeroCommission = newCommissionRate === 0;
      
      const { error } = await supabase
        .from('conversions')
        .update({
          commission_rate: newCommissionRate,
          commission_amount: newCommissionAmount,
          commissionable_amount: newCommissionableAmount,
          status: isZeroCommission ? 'approved' : 'pending',
          workflow_notes: isZeroCommission 
            ? `${notes ? notes + ' - ' : ''}Auto-approved: Zero commission conversion`
            : notes,
          // Clear previous approval data
          recommended_by: null,
          recommended_at: null,
          approved_by: isZeroCommission ? user.id : null,
          approved_at: isZeroCommission ? new Date().toISOString() : null,
          rejection_reason: null,
          // Track who amended it
          submitted_by: user.id,
          submitted_at: new Date().toISOString()
        })
        .eq('id', conversionId);
      
      if (error) throw error;
      
      if (isZeroCommission) {
        showSuccessToast("Conversion amended and auto-approved (zero commission)!");
        toast.success("No approval needed for zero commission conversions");
      } else {
        showSuccessToast("Conversion amended and resubmitted for approval!");
        toast.success("The approval process will now start over with the new commission details");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversions-workflow'] });
      queryClient.invalidateQueries({ queryKey: ['pending-conversions-count'] });
    },
    onError: (error) => {
      console.error('Error amending conversion:', error);
      showErrorToast("Failed to amend conversion");
    }
  });

  return {
    submitConversion: submitConversion.mutate,
    recommendConversion: recommendConversion.mutate,
    approveConversion: approveConversion.mutate,
    rejectConversion: rejectConversion.mutate,
    amendConversion: amendConversion.mutate,
    isLoading: submitConversion.isPending || recommendConversion.isPending || 
               approveConversion.isPending || rejectConversion.isPending || 
               amendConversion.isPending
  };
};

// Hook to get pending conversions count for navigation badge
export const usePendingConversionsCount = () => {
  const { user } = useAuth();
  const { data: userRole } = useUserRole();

  return useQuery({
    queryKey: ['pending-conversions-count', user?.id, userRole?.role],
    queryFn: async () => {
      if (!user?.id || !userRole?.role) return 0;

      // Only managers, directors, and admins can see pending conversions
      if (!['manager', 'director', 'admin'].includes(userRole.role)) {
        return 0;
      }

      let query = supabase
        .from('conversions')
        .select('id', { count: 'exact' });

      // Managers see pending conversions awaiting recommendation
      if (userRole.role === 'manager') {
        query = query.eq('status', 'pending');
      }
      // Directors see recommended conversions awaiting approval
      else if (userRole.role === 'director') {
        query = query.eq('status', 'recommended');
      }
      // Admins see both pending and recommended
      else if (userRole.role === 'admin') {
        query = query.in('status', ['pending', 'recommended']);
      }

      const { count, error } = await query;

      if (error) throw error;
      return count || 0;
    },
    enabled: !!user?.id && !!userRole?.role,
    refetchInterval: 30000, // Refetch every 30 seconds
  });
};

// Hook to enrich conversions with lead and profile data
export const useEnrichedConversions = () => {
  const { data: conversions, ...rest } = useConversions();
  
  return useQuery({
    queryKey: ['enriched-conversions', conversions],
    queryFn: async () => {
      if (!conversions || conversions.length === 0) return [];
      
      // Get unique lead IDs and user IDs
      const leadIds = [...new Set(conversions.map(c => c.lead_id).filter(Boolean))];
      const userIds = [...new Set([
        ...conversions.map(c => c.rep_id).filter(Boolean),
        ...conversions.map(c => c.submitted_by).filter(Boolean),
        ...conversions.map(c => c.recommended_by).filter(Boolean),
        ...conversions.map(c => c.approved_by).filter(Boolean)
      ])];
      
      // Fetch leads data
      const { data: leads } = await supabase
        .from('leads')
        .select('id, company_name, contact_name')
        .in('id', leadIds);
      
      // Fetch profiles data
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', userIds);
      
      // Create lookup maps
      const leadsMap = new Map(leads?.map(lead => [lead.id, lead]) || []);
      const profilesMap = new Map(profiles?.map(profile => [profile.id, profile]) || []);
      
      // Enrich conversions with related data
      return conversions.map(conversion => ({
        ...conversion,
        leads: leadsMap.get(conversion.lead_id),
        profiles: profilesMap.get(conversion.rep_id),
        submitted_profile: profilesMap.get(conversion.submitted_by),
        recommended_profile: profilesMap.get(conversion.recommended_by),
        approved_profile: profilesMap.get(conversion.approved_by)
      }));
    },
    enabled: !!conversions && conversions.length > 0
  });
};

// Hook to get approved conversions totals (only approved conversions count towards totals)
export const useApprovedConversionTotals = (userId?: string, dateRange?: { start: Date; end: Date }) => {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['approved-conversion-totals', userId || user?.id, dateRange],
    queryFn: async () => {
      const targetUserId = userId || user?.id;
      if (!targetUserId) return { totalRevenue: 0, totalCommission: 0, count: 0 };
      
      let query = supabase
        .from('conversions')
        .select('revenue_amount, commission_amount')
        .eq('rep_id', targetUserId)
        .eq('status', 'approved'); // Only approved conversions count
      
      if (dateRange) {
        query = query
          .gte('conversion_date', dateRange.start.toISOString().split('T')[0])
          .lte('conversion_date', dateRange.end.toISOString().split('T')[0]);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      
      const totalRevenue = data?.reduce((sum, conv) => sum + (conv.revenue_amount || 0), 0) || 0;
      const totalCommission = data?.reduce((sum, conv) => sum + (conv.commission_amount || 0), 0) || 0;
      
      return {
        totalRevenue,
        totalCommission,
        count: data?.length || 0
      };
    },
    enabled: !!(userId || user?.id)
  });
};
