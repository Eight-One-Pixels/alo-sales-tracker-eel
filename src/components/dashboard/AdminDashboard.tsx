import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Users, Building, TrendingUp, DollarSign, UserPlus, Activity, Target } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState } from "react";
import { getUserCurrencyContext, convertCurrency } from "@/lib/currency";
import { DetailedLeadsTable } from "../tables/DetailedLeadsTable";
import { DetailedConversionsTable } from "../tables/DetailedConversionsTable";
import { DetailedVisitsTable } from "../tables/DetailedVisitsTable";
import { DetailedUsersTableDialog } from "../tables/DetailedUsersTable";
import { ConversionsManagement } from "../ConversionsManagement";

type AdminView = 'dashboard' | 'approval-center';

export const AdminDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [selectedPeriod, setSelectedPeriod] = useState("month");
  const [convertedStats, setConvertedStats] = useState<{ totalRevenue: number, baseCurrency: string } | null>(null);
  const [showLeadsTable, setShowLeadsTable] = useState(false);
  const [showConversionsTable, setShowConversionsTable] = useState(false);
  const [showVisitsTable, setShowVisitsTable] = useState(false);
  const [showUsersTable, setShowUsersTable] = useState(false);
  const [currentView, setCurrentView] = useState<AdminView>('dashboard');

  // Fetch organization overview stats
  const { data: orgStats, isLoading } = useQuery({
    queryKey: ['org-stats', selectedPeriod],
    queryFn: async () => {
      const today = new Date();
      let startDate: Date;
      
      if (selectedPeriod === "day") {
        startDate = today;
      } else if (selectedPeriod === "week") {
        startDate = new Date(today.setDate(today.getDate() - 7));
      } else {
        startDate = new Date(today.getFullYear(), today.getMonth(), 1);
      }
      
      // Get all users
      const { data: allUsers } = await supabase
        .from('profiles_with_roles')
        .select('*');

      // Get total visits
      const { count: totalVisits } = await supabase
        .from('daily_visits')
        .select('*', { count: 'exact', head: true })
        .gte('visit_date', startDate.toISOString().split('T')[0]);

      // Get total leads
      const { count: totalLeads } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', startDate.toISOString());

      // Get total conversions and revenue - only approved conversions count
      const { data: conversions } = await supabase
        .from('conversions')
        .select('revenue_amount, currency')
        .eq('status', 'approved')
        .gte('conversion_date', startDate.toISOString().split('T')[0]);

      return {
        totalUsers: allUsers?.length || 0,
        totalVisits: totalVisits || 0,
        totalLeads: totalLeads || 0,
        totalConversions: conversions?.length || 0,
        conversions: conversions || [],
        allUsers: allUsers || []
      };
    }
  });

  // Convert revenue to user's preferred currency
  useEffect(() => {
    async function convertRevenue() {
      if (!user || !orgStats?.conversions) return;
      
      const { base } = await getUserCurrencyContext(user);
      let totalRevenue = 0;
      
      if (orgStats.conversions.length > 0) {
        const convertedAmounts = await Promise.all(
          orgStats.conversions.map(async (conv) => {
            const amount = Number(conv.revenue_amount) || 0;
            const fromCurrency = conv.currency || 'USD';
            try {
              return await convertCurrency(amount, fromCurrency, base);
            } catch {
              return amount;
            }
          })
        );
        totalRevenue = convertedAmounts.reduce((sum, val) => sum + val, 0);
      }
      
      setConvertedStats({ totalRevenue, baseCurrency: base });
    }
    convertRevenue();
  }, [user, orgStats]);

  // Fetch recent activity
  const { data: recentActivity } = useQuery({
    queryKey: ['recent-activity', selectedPeriod],
    queryFn: async () => {
      const today = new Date();
      let startDate: Date;
      
      if (selectedPeriod === "day") {
        startDate = today;
      } else if (selectedPeriod === "week") {
        startDate = new Date(today.setDate(today.getDate() - 7));
      } else {
        startDate = new Date(today.getFullYear(), today.getMonth(), 1);
      }

      // Get recent leads with creator info
      const { data: recentLeads } = await supabase
        .from('leads')
        .select(`
          id,
          company_name,
          contact_name,
          status,
          created_at,
          created_by,
          profiles:created_by!inner(full_name, email)
        `)
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: false })
        .limit(5);

      // Get recent conversions with rep info
      const { data: recentConversions } = await supabase
        .from('conversions')
        .select(`
          id,
          conversion_date,
          revenue_amount,
          currency,
          rep_id,
          lead_id,
          leads!inner(company_name, contact_name),
          profiles:rep_id!inner(full_name, email)
        `)
        .gte('conversion_date', startDate.toISOString().split('T')[0])
        .order('conversion_date', { ascending: false })
        .limit(5);

      return {
        recentLeads: recentLeads || [],
        recentConversions: recentConversions || []
      };
    }
  });

  const statCards = [
    {
      title: "Total Users",
      value: orgStats?.totalUsers || 0,
      icon: Users,
      color: "blue",
      description: "Active users",
      onClick: () => setShowUsersTable(true)
    },
    {
      title: `${selectedPeriod === 'day' ? 'Today' : selectedPeriod === 'week' ? 'This Week' : 'This Month'} Visits`,
      value: orgStats?.totalVisits || 0,
      icon: Activity,
      color: "green",
      description: "All teams",
      onClick: () => setShowVisitsTable(true)
    },
    {
      title: `${selectedPeriod === 'day' ? 'Today' : selectedPeriod === 'week' ? 'This Week' : 'This Month'} Leads`,
      value: orgStats?.totalLeads || 0,
      icon: Building,
      color: "purple",
      description: "Organization wide",
      onClick: () => setShowLeadsTable(true)
    },
    {
      title: "Total Revenue",
      value: convertedStats ? `${convertedStats.baseCurrency} ${convertedStats.totalRevenue.toLocaleString()}` : '...',
      icon: DollarSign,
      color: "orange",
      description: `${selectedPeriod === 'day' ? 'Today' : selectedPeriod === 'week' ? 'This week' : 'This month'}`,
      onClick: () => setShowConversionsTable(true)
    }
  ];

  const getColorClasses = (color: string) => {
    const colors = {
      blue: "from-blue-500 to-blue-600",
      green: "from-green-500 to-green-600",
      purple: "from-purple-500 to-purple-600",
      orange: "from-orange-500 to-orange-600"
    };
    return colors[color as keyof typeof colors] || colors.blue;
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  if (isLoading) {
    return (
      <div className="space-y-8">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/3 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="h-24 bg-gray-200 rounded"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (currentView === 'approval-center') {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Button onClick={() => setCurrentView('dashboard')} variant="outline">
            ← Back to Dashboard
          </Button>
        </div>
        <ConversionsManagement />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Organization Overview</h2>
          <p className="text-gray-600">Monitor organization-wide performance and manage system settings</p>
        </div>
        <div className="flex flex-wrap gap-2 justify-center sm:justify-end">
          <Button 
            onClick={() => setCurrentView('approval-center')} 
            variant="outline" 
            className="text-blue-600 border-blue-600 hover:bg-blue-50 flex items-center gap-2"
          >
            <Target className="h-4 w-4" />
            <span className="hidden sm:inline">Approval Center</span>
          </Button>
          <Link to="/clients">
            <Button variant="outline" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">View Clients</span>
            </Button>
          </Link>
          <Link to="/manage-users">
            <Button className="bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 flex items-center gap-2">
              <UserPlus className="h-4 w-4" />
              <span className="hidden sm:inline">Manage Users</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Period Selector */}
      <div className="flex gap-2">
        <Button 
          variant={selectedPeriod === "day" ? "default" : "outline"}
          size="sm"
          onClick={() => setSelectedPeriod("day")}
        >
          Today
        </Button>
        <Button 
          variant={selectedPeriod === "week" ? "default" : "outline"}
          size="sm"
          onClick={() => setSelectedPeriod("week")}
        >
          This Week
        </Button>
        <Button 
          variant={selectedPeriod === "month" ? "default" : "outline"}
          size="sm"
          onClick={() => setSelectedPeriod("month")}
        >
          This Month
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
        {statCards.map((stat, index) => (
          <Card 
        key={index} 
        className="p-4 sm:p-6 hover:shadow-lg transition-all duration-300 hover:scale-105 border-0 shadow-md bg-white/70 backdrop-blur-sm cursor-pointer min-w-0"
        onClick={stat.onClick}
          >
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <p className="text-xs sm:text-sm font-medium text-gray-600 mb-1 truncate">{stat.title}</p>
            <p className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1 truncate">
          {isLoading ? (
            <span className="animate-pulse text-gray-400">...</span>
          ) : (
            stat.value
          )}
            </p>
            <p className="text-xs text-gray-500 truncate">{stat.description}</p>
          </div>
          <div className={`p-2 sm:p-3 rounded-xl bg-gradient-to-r ${getColorClasses(stat.color)}`}>
            <stat.icon className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
          </div>
        </div>
          </Card>
        ))}
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6 bg-white/70 backdrop-blur-sm border-0 shadow-md">
          <h3 className="text-xl font-bold text-gray-900 mb-4">Recent Leads</h3>
          <div className="space-y-4">
            {recentActivity?.recentLeads?.map((lead, index) => (
              <div key={index} className="flex items-center justify-between p-3 rounded-lg border border-gray-100">
                <div>
                  <h4 className="font-semibold text-gray-900">{lead.company_name}</h4>
                  <p className="text-sm text-gray-600">{lead.contact_name}</p>
                  <p className="text-xs text-gray-500">
                    by {lead.profiles?.full_name || lead.profiles?.email || 'Unknown'}
                  </p>
                </div>
                <Badge variant="outline" className="capitalize">
                  {lead.status?.replace('_', ' ')}
                </Badge>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6 bg-white/70 backdrop-blur-sm border-0 shadow-md">
          <h3 className="text-xl font-bold text-gray-900 mb-4">Recent Conversions</h3>
          <div className="space-y-4">
            {recentActivity?.recentConversions?.map((conversion, index) => (
              <div key={index} className="flex items-center justify-between p-3 rounded-lg border border-gray-100">
                <div>
                  <h4 className="font-semibold text-gray-900">{conversion.leads?.company_name}</h4>
                  <p className="text-sm text-gray-600">{conversion.leads?.contact_name}</p>
                  <p className="text-xs text-gray-500">
                    by {conversion.profiles?.full_name || conversion.profiles?.email || 'Unknown'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-green-600">
                    {conversion.currency} {Number(conversion.revenue_amount).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Detailed Tables */}
      {!isLoading && (
        <>
          <DetailedLeadsTable 
            open={showLeadsTable} 
            onOpenChange={setShowLeadsTable}
            dateFilter={selectedPeriod as 'today' | 'week' | 'month'}
            scope="team"
            title="Organization Leads"
          />
          <DetailedConversionsTable 
            open={showConversionsTable} 
            onOpenChange={setShowConversionsTable}
            dateFilter={selectedPeriod as 'today' | 'week' | 'month'}
            scope="team"
            title="Organization Conversions"
          />
          <DetailedVisitsTable 
            open={showVisitsTable} 
            onOpenChange={setShowVisitsTable}
            dateFilter={selectedPeriod as 'today' | 'week' | 'month'}
            title="Organization Visits"
            scope="team"
          />
          <DetailedUsersTableDialog open={showUsersTable} onOpenChange={setShowUsersTable} />
        </>
      )}
    </div>
  );
};
