import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Eye, EyeOff, Building2, Mail, KeyRound, X } from "lucide-react";
import icon from '@/assets/icon.png';

const Auth = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showAuthOptions, setShowAuthOptions] = useState(false);
  const [failedEmail, setFailedEmail] = useState("");
  const [sendingMagicLink, setSendingMagicLink] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Check if user is already logged in
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        navigate("/");
      }
    };
    checkUser();
  }, [navigate]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setShowAuthOptions(false);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        // For any authentication error, offer alternative login methods
        if (error.message.includes("Invalid login credentials") || 
            error.message.includes("invalid password") ||
            error.message.includes("wrong password") ||
            error.message.includes("Email not confirmed")) {
          
          setFailedEmail(email);
          setShowAuthOptions(true);
          toast.error("Login failed. Choose an alternative method below:");
          return;
        }
        throw error;
      }

      if (data.user) {
        toast.success("Successfully signed in!");
        navigate("/");
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to sign in");
    } finally {
      setLoading(false);
    }
  };

  const handleSendMagicLink = async () => {
    setSendingMagicLink(true);
    
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: failedEmail,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
        },
      });

      if (error) throw error;

      toast.success("Magic link sent! Please check your email and click the link to sign in.");
      setShowAuthOptions(false);
      setPassword(""); // Clear password field
    } catch (error: any) {
      toast.error(error.message || "Failed to send magic link");
    } finally {
      setSendingMagicLink(false);
    }
  };

  const handleSendPasswordReset = async () => {
    setSendingReset(true);
    
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(
        failedEmail,
        { redirectTo: `${window.location.origin}/auth` }
      );

      if (error) throw error;

      toast.success("Password reset link sent! Check your email to reset your password.");
      setShowAuthOptions(false);
      setPassword(""); // Clear password field
    } catch (error: any) {
      toast.error(error.message || "Failed to send password reset link");
    } finally {
      setSendingReset(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
          emailRedirectTo: `${window.location.origin}/`,
        },
      });

      if (error) throw error;

      if (data.user) {
        toast.success("Account created successfully! Please check your email to verify your account.");
        // Don't redirect immediately, let them verify email first
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to create account");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <img src={icon} alt="Alo—Sales icon" className="h-8 w-8 text-indigo-600" />
            <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
              Alo—Sales
            </h1>
          </div>
          <p className="text-gray-600">Comprehensive sales management platform</p>
        </div>

        <Card className="p-6 bg-white/80 backdrop-blur-sm border-0 shadow-lg">
          <Tabs defaultValue="signin" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Sign In</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
            </TabsList>

            <TabsContent value="signin" className="space-y-4 mt-6">
              <form onSubmit={handleSignIn} className="space-y-4">
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      required
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
                <Button
                  type="submit"
                  className="w-full bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600"
                  disabled={loading}
                >
                  {loading ? "Signing in..." : "Sign In"}
                </Button>
              </form>

              {showAuthOptions && (
                <div className="mt-4 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-medium text-blue-800">Alternative Login Methods</h3>
                    <Button
                      onClick={() => setShowAuthOptions(false)}
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-blue-600 hover:bg-blue-100"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-blue-600 mb-4">
                    Choose how you'd like to access your account: <strong>{failedEmail}</strong>
                  </p>
                  
                  <div className="space-y-3">
                    {/* Magic Link Option */}
                    <div className="p-3 bg-white rounded-md border border-blue-100">
                      <div className="flex items-center gap-2 mb-2">
                        <Mail className="h-4 w-4 text-blue-600" />
                        <span className="text-sm font-medium text-blue-800">Magic Login Link</span>
                      </div>
                      <p className="text-xs text-gray-600 mb-3">
                        Get a secure login link sent to your email. No password needed!
                      </p>
                      <Button
                        onClick={handleSendMagicLink}
                        disabled={sendingMagicLink}
                        className="w-full bg-blue-600 hover:bg-blue-700"
                        size="sm"
                      >
                        {sendingMagicLink ? "Sending Magic Link..." : "Send Magic Link"}
                      </Button>
                    </div>

                    {/* Password Reset Option */}
                    <div className="p-3 bg-white rounded-md border border-blue-100">
                      <div className="flex items-center gap-2 mb-2">
                        <KeyRound className="h-4 w-4 text-indigo-600" />
                        <span className="text-sm font-medium text-indigo-800">Reset Password</span>
                      </div>
                      <p className="text-xs text-gray-600 mb-3">
                        Get a link to create a new password for your account.
                      </p>
                      <Button
                        onClick={handleSendPasswordReset}
                        disabled={sendingReset}
                        className="w-full bg-indigo-600 hover:bg-indigo-700"
                        size="sm"
                      >
                        {sendingReset ? "Sending Reset Link..." : "Send Password Reset"}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="signup" className="space-y-4 mt-6">
              <form onSubmit={handleSignUp} className="space-y-4">
                <div>
                  <Label htmlFor="fullName">Full Name</Label>
                  <Input
                    id="fullName"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Enter your full name"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="signupEmail">Email</Label>
                  <Input
                    id="signupEmail"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="signupPassword">Password</Label>
                  <div className="relative">
                    <Input
                      id="signupPassword"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Create a password"
                      required
                      minLength={6}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
                <Button
                  type="submit"
                  className="w-full bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600"
                  disabled={loading}
                >
                  {loading ? "Creating account..." : "Create Account"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
};

export default Auth;
