import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/components/ThemeProvider";
import { toast } from "sonner";
import { Moon, Sun, Monitor } from "lucide-react";

export const GeneralSettings = () => {
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  const queryClient = useQueryClient();
  
  const [currency, setCurrency] = useState("MWK");
  const [dateFormat, setDateFormat] = useState("MM/DD/YYYY");
  const [timeFormat, setTimeFormat] = useState("12");
  const [language, setLanguage] = useState("en");
  const [autoSave, setAutoSave] = useState(true);
  const [compactView, setCompactView] = useState(false);
  const [defaultCommissionRate, setDefaultCommissionRate] = useState("10");

  // Fetch user preferences
  useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from('profiles')
        .select('preferred_currency, default_commission_rate')
        .eq('id', user.id)
        .single();
      return data;
    },
    enabled: !!user?.id,
    onSuccess: (data) => {
      if (data?.default_commission_rate !== undefined && data?.default_commission_rate !== null) {
        setDefaultCommissionRate(String(data.default_commission_rate));
      }
      if (data?.preferred_currency) {
        setCurrency(data.preferred_currency);
      } else {
        setCurrency("USD");
      }
    }
  });

  const updateProfile = useMutation({
    mutationFn: async (updates: any) => {
      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user?.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      toast.success('Settings updated successfully');
    },
    onError: () => {
      toast.error('Failed to update settings');
    }
  });

  const handleSave = () => {
    updateProfile.mutate({
      preferred_currency: currency,
      default_commission_rate: parseFloat(defaultCommissionRate)
    });
  };

  const getThemeIcon = () => {
    switch (theme) {
      case "dark":
        return <Moon className="h-4 w-4" />;
      case "light":
        return <Sun className="h-4 w-4" />;
      default:
        return <Monitor className="h-4 w-4" />;
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-6 bg-white/70 backdrop-blur-sm dark:bg-slate-800/90 dark:border-slate-700 transition-colors">
        <h3 className="text-lg font-semibold mb-4 dark:text-slate-100">Currency & Regional Settings</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="currency" className="dark:text-slate-200">Default Currency</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger className="dark:bg-slate-700 dark:border-slate-600">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                <SelectItem value="MWK">MWK - Malawian Kwacha</SelectItem>
                <SelectItem value="USD">USD - US Dollar</SelectItem>
                <SelectItem value="EUR">EUR - Euro</SelectItem>
                <SelectItem value="GBP">GBP - British Pound</SelectItem>
                <SelectItem value="JPY">JPY - Japanese Yen</SelectItem>
                <SelectItem value="CAD">CAD - Canadian Dollar</SelectItem>
                <SelectItem value="AUD">AUD - Australian Dollar</SelectItem>
                <SelectItem value="ZAR">ZAR - South African Rand</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="dateFormat" className="dark:text-slate-200">Date Format</Label>
            <Select value={dateFormat} onValueChange={setDateFormat}>
              <SelectTrigger className="dark:bg-slate-700 dark:border-slate-600">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="timeFormat" className="dark:text-slate-200">Time Format</Label>
            <Select value={timeFormat} onValueChange={setTimeFormat}>
              <SelectTrigger className="dark:bg-slate-700 dark:border-slate-600">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                <SelectItem value="12">12-hour (AM/PM)</SelectItem>
                <SelectItem value="24">24-hour</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="language" className="dark:text-slate-200">Language</Label>
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger className="dark:bg-slate-700 dark:border-slate-600">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="es">Spanish</SelectItem>
                <SelectItem value="fr">French</SelectItem>
                <SelectItem value="de">German</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <Card className="p-6 bg-white/70 backdrop-blur-sm dark:bg-slate-800/90 dark:border-slate-700 transition-colors">
        <h3 className="text-lg font-semibold mb-4 dark:text-slate-100">Sales Preferences</h3>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="defaultCommission" className="dark:text-slate-200">Default Commission Rate (%)</Label>
            <Input
              id="defaultCommission"
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={defaultCommissionRate}
              onChange={(e) => setDefaultCommissionRate(e.target.value)}
              className="max-w-xs dark:bg-slate-700 dark:border-slate-600"
            />
            <p className="text-sm text-gray-600 dark:text-slate-400">Used as default when creating new conversions</p>
          </div>
        </div>
      </Card>

      <Card className="p-6 bg-white/70 backdrop-blur-sm dark:bg-slate-800/90 dark:border-slate-700 transition-colors">
        <h3 className="text-lg font-semibold mb-4 dark:text-slate-100">Appearance & Interface</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="dark:text-slate-200">Theme</Label>
              <p className="text-sm text-gray-600 dark:text-slate-400">Choose your preferred theme</p>
            </div>
            <div className="flex items-center space-x-2">
              {getThemeIcon()}
              <Select value={theme} onValueChange={(value: "light" | "dark" | "system") => setTheme(value)}>
                <SelectTrigger className="w-32 dark:bg-slate-700 dark:border-slate-600">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="dark:bg-slate-800 dark:border-slate-700">
                  <SelectItem value="light">
                    <div className="flex items-center space-x-2">
                      <Sun className="h-4 w-4" />
                      <span>Light</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="dark">
                    <div className="flex items-center space-x-2">
                      <Moon className="h-4 w-4" />
                      <span>Dark</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="system">
                    <div className="flex items-center space-x-2">
                      <Monitor className="h-4 w-4" />
                      <span>System</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator className="dark:bg-slate-700" />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="dark:text-slate-200">Compact View</Label>
              <p className="text-sm text-gray-600 dark:text-slate-400">Show more data in less space</p>
            </div>
            <Switch 
              checked={compactView} 
              onCheckedChange={setCompactView}
              className="data-[state=checked]:bg-primary"
            />
          </div>

          <Separator className="dark:bg-slate-700" />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="dark:text-slate-200">Auto-save Forms</Label>
              <p className="text-sm text-gray-600 dark:text-slate-400">Automatically save form changes</p>
            </div>
            <Switch 
              checked={autoSave} 
              onCheckedChange={setAutoSave}
              className="data-[state=checked]:bg-primary"
            />
          </div>
        </div>
      </Card>

      <div className="flex justify-end">
        <Button 
          onClick={handleSave} 
          disabled={updateProfile.isPending}
          className="dark:bg-primary dark:text-primary-foreground dark:hover:bg-primary/90"
        >
          Save Settings
        </Button>
      </div>
    </div>
  );
};
