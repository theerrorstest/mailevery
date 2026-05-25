import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import ApiKey from '@/models/ApiKey';
import User from '@/models/User';
import SmtpConfig from '@/models/SmtpConfig';
import EmailTemplate from '@/models/EmailTemplate';
import EmailLog from '@/models/EmailLog';
import ContactGroup from '@/models/ContactGroup';
import emailQueue from '@/lib/queue/emailQueue';
import { createTransporter, sendEmail } from '@/lib/mailer';

export async function POST(req) {
  try {
    await connectDB();

    const { to, groupId, templateId, variables, useQueue = false } = await req.json();

    if ((!to && !groupId) || !templateId) {
      return NextResponse.json(
        { error: 'Missing required fields: templateId and either to or groupId must be provided' },
        { status: 400 }
      );
    }

    // Get the template
    const template = await EmailTemplate.findById(templateId);
    if (!template) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      );
    }

    // Get user from template
    const user = await User.findById(template.user);
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Get SMTP config
    const smtpConfig = await SmtpConfig.findById(user.smtp);
    if (!smtpConfig) {
      return NextResponse.json(
        { error: 'SMTP configuration not found' },
        { status: 404 }
      );
    }

    // Replace variables in template
    let subject = template.subject;
    let body = template.body;
    
    if (template.type === 'dynamic' && variables) {
      Object.entries(variables).forEach(([key, value]) => {
        const regex = new RegExp(`{${key}}`, 'g');
        subject = subject.replace(regex, value);
        body = body.replace(regex, value);
      });
    }

    // Determine list of recipients
    let recipients = [];
    let group = null;

    if (groupId) {
      group = await ContactGroup.findById(groupId);
      if (!group) {
        return NextResponse.json(
          { error: 'Contact group not found' },
          { status: 404 }
        );
      }
      recipients = group.emails;
    } else {
      recipients = [to];
    }

    if (recipients.length === 0) {
      return NextResponse.json(
        { error: 'No recipients to send to' },
        { status: 400 }
      );
    }

    if (useQueue) {
      // Add jobs to email queue
      const jobIds = [];
      for (const recipient of recipients) {
        const job = await emailQueue.add('send-email', {
          userId: user._id.toString(),
          to: recipient,
          subject,
          html: body,
          group: group ? group._id.toString() : null,
          type: template.type,
        });
        jobIds.push(job.id);
      }

      return NextResponse.json({
        success: true,
        queued: true,
        jobIds,
      });
    } else {
      // Send directly
      const transporter = await createTransporter(smtpConfig);
      const results = [];
      let successCount = 0;

      for (const recipient of recipients) {
        const result = await sendEmail(transporter, {
          from: `"Esson Group Support" <${smtpConfig.username}>`,
          to: recipient,
          subject,
          text: body,
        });

        // Log the email attempt
        await EmailLog.create({
          user: user._id,
          template: template._id,
          to: recipient,
          subject,
          body,
          type: template.type,
          status: result.success ? "success" : "failed",
          error: result.error || null,
        });

        results.push({ email: recipient, ...result });
        if (result.success) successCount++;
      }

      const allSuccess = successCount === recipients.length;
      return NextResponse.json({
        success: allSuccess,
        results,
        message: `${successCount} out of ${recipients.length} emails sent successfully`,
      });
    }
  } catch (error) {
    console.error('Error sending email:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}