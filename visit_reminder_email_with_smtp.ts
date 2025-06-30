import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import nodemailer from "npm:nodemailer";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

const handler = async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { to, visitData } = await req.json();
    console.log("Sending visit reminder to:", to);
    console.log("Visit data:", visitData);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { error: insertError } = await supabase.from("notifications").insert({
      type: "visit_reminder",
      recipient_email: to,
      title: `Upcoming Meeting - ${visitData.company_name}`,
      message: `Meeting with ${visitData.contact_person} at ${visitData.company_name} scheduled for ${new Date(visitData.visit_datetime).toLocaleString()}`,
      metadata: visitData,
      sent_at: new Date().toISOString()
    });
    if (insertError) {
      console.error("Error storing notification:", JSON.stringify(insertError, null, 2));
    }

    const emailHtml = `<div style="font-family: 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background-color: #ffffff; color: #1f2937; border: 1px solid #e5e7eb; border-radius: 8px;">
      <header style="border-bottom: 1px solid #e5e7eb; padding-bottom: 16px; margin-bottom: 24px;">
        <h1 style="color: #111827; font-size: 20px; margin: 0;">Alo—Sales | Meeting Reminder</h1>
      </header>
      <section>
        <p style="font-size: 16px; margin-bottom: 16px;">Hi ${visitData.contact_person || "there"},</p>
        <p style="font-size: 15px; margin-bottom: 16px;">This is a friendly reminder about your upcoming meeting with us.</p>
        <div style="background-color: #f9fafb; border-left: 4px solid #4F46E5; padding: 16px; border-radius: 6px; margin-bottom: 24px;">
          <p style="margin: 0; font-size: 15px;"><strong>Company:</strong> ${visitData.company_name}</p>
          <p style="margin: 0; font-size: 15px;"><strong>Meeting Type:</strong> ${visitData.visit_type.replace("_", " ").toUpperCase()}</p>
          <p style="margin: 0; font-size: 15px;"><strong>Date & Time:</strong> ${new Date(visitData.visit_datetime).toLocaleString()}</p>
          <p style="margin: 0; font-size: 15px;"><strong>Sales Rep:</strong> ${visitData.rep_name}</p>
          ${visitData.notes ? `<p style="margin: 0; font-size: 15px;"><strong>Notes:</strong> ${visitData.notes}</p>` : ""}
        </div>
        <p style="font-size: 15px; margin-bottom: 24px;">If you need to reschedule or have any questions, please reply to this email or contact your sales representative directly.</p>
        <p style="font-size: 14px; color: #6b7280; margin-bottom: 4px;">Best regards,</p>
        <p style="font-size: 14px; color: #6b7280; margin: 0;">${visitData.rep_name}<br>Alo—Sales Team</p>
      </section>
      <footer style="margin-top: 40px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af;">
        <p style="margin: 0;">This email was sent by Alo—Sales, ${visitData.rep_name}. For any inquiries, contact support@edenestatesmw.com</p>
      </footer>
    </div>`;

    const transporter = nodemailer.createTransport({
      host: "edenestatesmw.com",
      port: 465,
      secure: true,
      auth: {
        user: "no-reply@edenestatesmw.com",
        pass: Deno.env.get("SMTP_PASSWORD") // Secure via env
      }
    });

    const mailOptions = {
      from: '"Alo Sales" <no-reply@edenestatesmw.com>',
      to,
      subject: `Upcoming Meeting - ${visitData.company_name}`,
      html: emailHtml
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent:", info.messageId);

    return new Response(JSON.stringify({
      success: true,
      message: "Visit reminder sent successfully",
      messageId: info.messageId
    }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders }
    });
  } catch (error) {
    console.error("Error in send-visit-reminder function:", error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message || "Unknown error"
    }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders }
    });
  }
};

serve(handler);