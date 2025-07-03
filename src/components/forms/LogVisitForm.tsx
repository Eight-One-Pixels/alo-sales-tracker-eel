import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { CalendarIcon, Clock, Mail, Calendar as CalendarIntegration } from "lucide-react";
import { format, isFuture, isPast } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { ClientSearchInput } from "./ClientSearchInput";
import { createClientSafely } from "@/lib/clientValidation";

interface LogVisitFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialValues?: {
    company_name?: string;
    contact_person?: string;
    contact_email?: string;
  };
}

interface Client {
  id: string;
  company_name: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
}

export const LogVisitForm = ({ open, onOpenChange, initialValues }: LogVisitFormProps) => {
  const { user } = useAuth();
  const [date, setDate] = useState<Date>(new Date());
  const [time, setTime] = useState<string>("09:00");
  const [companyName, setCompanyName] = useState(initialValues?.company_name || "");
  const [contactPerson, setContactPerson] = useState(initialValues?.contact_person || "");
  const [contactEmail, setContactEmail] = useState(initialValues?.contact_email || "");
  const [visitType, setVisitType] = useState<"cold_call" | "follow_up" | "presentation" | "meeting" | "phone_call">("cold_call");
  const [durationMinutes, setDurationMinutes] = useState("");
  const [outcome, setOutcome] = useState("");
  const [notes, setNotes] = useState("");
  const [leadGenerated, setLeadGenerated] = useState(false);
  const [followUpRequired, setFollowUpRequired] = useState(false);
  const [followUpDate, setFollowUpDate] = useState("");
  const [sendEmailReminder, setSendEmailReminder] = useState(false);
  const [addToCalendar, setAddToCalendar] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);

  const isScheduled = isFuture(date);
  const isCompleted = isPast(date) || date.toDateString() === new Date().toDateString();

  // Update form when initialValues change
  useEffect(() => {
    if (initialValues) {
      setCompanyName(initialValues.company_name || "");
      setContactPerson(initialValues.contact_person || "");
      setContactEmail(initialValues.contact_email || "");
    }
  }, [initialValues]);

  const handleClientSelect = (client: Client | null) => {
    setSelectedClient(client);
    if (client) {
      setCompanyName(client.company_name);
      setContactPerson(client.contact_person || "");
      setContactEmail(client.email || "");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    try {
      const visitDateTime = new Date(date);
      if (time) {
        const [hours, minutes] = time.split(':');
        visitDateTime.setHours(parseInt(hours), parseInt(minutes));
      }

      const visitData = {
        rep_id: user.id,
        visit_date: format(visitDateTime, 'yyyy-MM-dd'),
        visit_time: time || null,
        company_name: companyName,
        contact_person: contactPerson,
        contact_email: contactEmail || null,
        visit_type: visitType,
        duration_minutes: durationMinutes ? parseInt(durationMinutes) : null,
        outcome: outcome || null,
        notes,
        lead_generated: leadGenerated,
        follow_up_required: followUpRequired,
        follow_up_date: followUpDate || null,
        status: isScheduled ? 'scheduled' : 'completed'
      };

      const { error } = await supabase
        .from('daily_visits')
        .insert(visitData);

      if (error) throw error;

      // Always create/update client record when visiting a company (unless client was selected from existing)
      let clientResult = null;
      if (companyName && !selectedClient) {
        const clientData = {
          created_by: user.id,
          company_name: companyName,
          contact_person: contactPerson || null,
          email: contactEmail || null,
          phone: '', // Will need to be filled later
          address: '', // Will need to be filled later
          industry: '', // Will need to be filled later
          notes: `Visited on ${format(visitDateTime, 'yyyy-MM-dd')}. Visit notes: ${notes || 'No additional notes'}`
        };

        clientResult = await createClientSafely(clientData, {
          returnExistingIfDuplicate: true, // Return existing client if duplicate found
          updateIfExists: contactPerson || contactEmail ? true : false // Update if we have new contact info
        });

        if (!clientResult.success && !clientResult.isDuplicate) {
          console.warn('Failed to create/update client:', clientResult.error);
          toast.warning("Visit saved but failed to create/update client record");
        }
      }

      // If lead was generated, create a lead entry
      if (leadGenerated && companyName && contactPerson) {
        const leadData = {
          created_by: user.id,
          company_name: companyName,
          contact_name: contactPerson,
          contact_email: contactEmail || null,
          contact_phone: '', // Will need to be filled later
          source: 'Visit',
          status: 'new' as "new" | "contacted" | "qualified" | "proposal" | "negotiation" | "closed_won" | "closed_lost",
          notes: `Generated from visit on ${format(visitDateTime, 'yyyy-MM-dd')}. Original notes: ${notes}`
        };

        const { error: leadError } = await supabase
          .from('leads')
          .insert(leadData);

        // Client was already created above, so we only need to handle lead creation errors
        if (leadError) {
          console.warn('Failed to create lead:', leadError);
          toast.warning("Visit and client saved but failed to create lead automatically");
        }
      }

      // Only increment goals for completed visits
      if (isCompleted) {
        const today = new Date();
        const { data: goalData, error: goalError } = await supabase
          .from('goals')
          .select('current_value')
          .eq('user_id', user.id)
          .eq('goal_type', 'visits')
          .lte('period_start', today.toISOString().split('T')[0])
          .gte('period_end', today.toISOString().split('T')[0])
          .single();

        if (!goalError && goalData) {
          await supabase
            .from('goals')
            .update({ current_value: (goalData?.current_value ?? 0) + 1 })
            .eq('user_id', user.id)
            .eq('goal_type', 'visits')
            .lte('period_start', today.toISOString().split('T')[0])
            .gte('period_end', today.toISOString().split('T')[0]);
        }
      }

      // Handle email notifications for scheduled visits
      if (isScheduled && sendEmailReminder && contactEmail) {
        try {
          await supabase.functions.invoke('send-visit-reminder', {
            body: {
              to: contactEmail,
              visitData: {
                ...visitData,
                visit_datetime: visitDateTime.toISOString(),
                rep_name: user.user_metadata?.full_name || user.email
              }
            }
          });
          console.log('Email reminder sent successfully');
        } catch (emailError) {
          console.error('Failed to send email reminder:', emailError);
          toast.error("Visit saved but email reminder failed to send");
        }
      }

      // Handle calendar integration
      if (addToCalendar && isScheduled) {
        generateCalendarEvent(visitData, visitDateTime);
      }

      const successMessage = leadGenerated 
        ? `${isScheduled ? "Visit scheduled" : "Visit logged"} and lead created successfully!`
        : `${isScheduled ? "Visit scheduled" : "Visit logged"} successfully!`;
      
      toast.success(successMessage);
      onOpenChange(false);
      resetForm();
    } catch (error) {
      console.error('Error saving visit:', error);
      toast.error("Failed to save visit");
    } finally {
      setLoading(false);
    }
  };

  const generateCalendarEvent = (visitData: any, visitDateTime: Date) => {
    const startTime = visitDateTime.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const endTime = new Date(visitDateTime.getTime() + (parseInt(durationMinutes) || 60) * 60000)
      .toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

    const title = encodeURIComponent(`${visitType.replace('_', ' ').toUpperCase()} - ${companyName}`);
    const details = encodeURIComponent(`Visit Type: ${visitType.replace('_', ' ')}\nContact: ${contactPerson}\nNotes: ${notes}`);
    
    const googleCalendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startTime}/${endTime}&details=${details}`;
    
    // Open in new tab
    window.open(googleCalendarUrl, '_blank');
  };

  const resetForm = () => {
    setCompanyName(initialValues?.company_name || "");
    setContactPerson(initialValues?.contact_person || "");
    setContactEmail(initialValues?.contact_email || "");
    setVisitType("cold_call");
    setDurationMinutes("");
    setOutcome("");
    setNotes("");
    setLeadGenerated(false);
    setFollowUpRequired(false);
    setFollowUpDate("");
    setSendEmailReminder(false);
    setAddToCalendar(false);
    setDate(new Date());
    setTime("09:00");
    setSelectedClient(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isScheduled ? <CalendarIcon className="h-5 w-5" /> : <Clock className="h-5 w-5" />}
            {isScheduled ? "Schedule Visit" : "Log Visit"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date">Visit Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(date, "PPP")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 bg-white border shadow-lg">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={(date) => date && setDate(date)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label htmlFor="time">Time</Label>
              <Input
                id="time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="companyName">Company Name</Label>
            <ClientSearchInput
              value={companyName}
              onValueChange={setCompanyName}
              onClientSelect={handleClientSelect}
              placeholder="Search existing clients or type company name..."
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="contactPerson">Contact Person</Label>
              <Input
                id="contactPerson"
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="contactEmail">Contact Email</Label>
              <Input
                id="contactEmail"
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="For reminders"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="visitType">Visit Type</Label>
              <Select value={visitType} onValueChange={(value) => setVisitType(value as typeof visitType)} required>
                <SelectTrigger>
                  <SelectValue placeholder="Select visit type" />
                </SelectTrigger>
                <SelectContent className="bg-white border shadow-lg">
                  <SelectItem value="cold_call">Cold Call</SelectItem>
                  <SelectItem value="follow_up">Follow Up</SelectItem>
                  <SelectItem value="presentation">Presentation</SelectItem>
                  <SelectItem value="meeting">Physical Meeting</SelectItem>
                  <SelectItem value="phone_call">Phone Call</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="duration">Duration (minutes)</Label>
              <Input
                id="duration"
                type="number"
                min="0"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(e.target.value)}
                placeholder="Duration"
              />
            </div>
          </div>

          {isCompleted && (
            <>
              <div className="space-y-2">
                <Label htmlFor="outcome">Outcome</Label>
                <Textarea
                  id="outcome"
                  value={outcome}
                  onChange={(e) => setOutcome(e.target.value)}
                  placeholder="What was the outcome of this visit?"
                />
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional notes..."
            />
          </div>

          {/* Enhanced Lead Generation Section */}
          <div className="space-y-3 p-3 bg-green-50 rounded-lg border">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="leadGenerated"
                checked={leadGenerated}
                onCheckedChange={checked => setLeadGenerated(checked === true)}
              />
              <Label htmlFor="leadGenerated" className="font-medium">
                {isScheduled ? "Expect to generate lead from this visit" : "Lead generated from this visit"}
              </Label>
            </div>
            
            {/* Info about client creation */}
            <div className="text-sm text-blue-700 bg-blue-100 p-2 rounded">
              <strong>Info:</strong> A client record will be automatically created or updated for this company.
            </div>
            
            {leadGenerated && (
              <div className="text-sm text-green-700 bg-green-100 p-2 rounded">
                <strong>Note:</strong> A new lead will be automatically created using the company and contact information above.
                {!contactPerson && (
                  <div className="text-orange-600 mt-1">
                    <strong>Tip:</strong> Add a contact person above for better lead tracking.
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="followUpRequired"
                checked={followUpRequired}
                onCheckedChange={checked => setFollowUpRequired(checked === true)}
              />
              <Label htmlFor="followUpRequired">Follow-up required</Label>
            </div>
            
            {followUpRequired && (
              <div className="space-y-2">
                <Label htmlFor="followUpDate">Follow-up Date</Label>
                <Input
                  id="followUpDate"
                  type="date"
                  value={followUpDate}
                  onChange={(e) => setFollowUpDate(e.target.value)}
                />
              </div>
            )}
          </div>

          {isScheduled && (
            <div className="space-y-3 p-3 bg-blue-50 rounded-lg border">
              <h4 className="text-sm font-medium text-blue-900">Scheduling Options</h4>
              
              {contactEmail && (
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="sendEmailReminder"
                    checked={sendEmailReminder}
                    onCheckedChange={checked => setSendEmailReminder(checked === true)}
                  />
                  <Label htmlFor="sendEmailReminder" className="flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    Send email reminder to contact
                  </Label>
                </div>
              )}

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="addToCalendar"
                  checked={addToCalendar}
                  onCheckedChange={checked => setAddToCalendar(checked === true)}
                />
                <Label htmlFor="addToCalendar" className="flex items-center gap-2">
                  <CalendarIntegration className="h-4 w-4" />
                  Add to Google Calendar
                </Label>
              </div>
            </div>
          )}

          <div className="flex justify-end space-x-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : isScheduled ? "Schedule Visit" : "Log Visit"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};