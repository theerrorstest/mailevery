  'use client';

import { useState, useEffect } from 'react';

export default function TestEmail() {
  const [testEmail, setTestEmail] = useState({
    to: '',
    groupId: '',
    templateId: '',
    variables: {},
    sendMode: 'single', // 'single' or 'group'
    useQueue: false,    // true to test the queue worker path
  });
  const [templates, setTemplates] = useState([]);
  const [groups, setGroups] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState({ subject: '', body: '' });

  useEffect(() => {
    fetchTemplates();
    fetchGroups();
  }, []);

  useEffect(() => {
    const updatePreview = () => {
      const selectedTemplate = templates.find(t => t._id === testEmail.templateId);
      if (!selectedTemplate) return;
  
      let subject = selectedTemplate.subject;
      let body = selectedTemplate.body;
  
      if (selectedTemplate.type === 'dynamic') {
        Object.entries(testEmail.variables).forEach(([key, value]) => {
          const regex = new RegExp(`{${key}}`, 'g');
          subject = subject.replace(regex, value);
          body = body.replace(regex, value);
        });
      }
  
      setPreview({ subject, body });
    };

    updatePreview();
  }, [testEmail.templateId, testEmail.variables, templates]);

  const fetchTemplates = async () => {
    try {
      const response = await fetch('/api/client/templates');
      const data = await response.json();
      if (data.success) {
        setTemplates(data.templates);
      }
    } catch (error) {
      console.error('Error fetching templates:', error);
    }
  };

  const fetchGroups = async () => {
    try {
      const response = await fetch('/api/client/contact-groups');
      const data = await response.json();
      if (data.success) {
        setGroups(data.groups);
      }
    } catch (error) {
      console.error('Error fetching contact groups:', error);
    }
  };

  const handleTestEmailSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const payload = {
        templateId: testEmail.templateId,
        variables: testEmail.variables,
        useQueue: testEmail.useQueue,
      };

      if (testEmail.sendMode === 'single') {
        payload.to = testEmail.to;
      } else {
        payload.groupId = testEmail.groupId;
      }

      const response = await fetch('/api/client/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send test email');
      }

      const deliveryMsg = testEmail.useQueue 
        ? 'Group emails successfully queued for worker processing!' 
        : data.message || 'Test email sent successfully';
        
      setSuccess(deliveryMsg);
      setTestEmail({
        to: '',
        groupId: '',
        templateId: '',
        variables: {},
        sendMode: testEmail.sendMode,
        useQueue: testEmail.useQueue,
      });
      setPreview({ subject: '', body: '' });
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVariableChange = (key, value) => {
    setTestEmail({
      ...testEmail,
      variables: {
        ...testEmail.variables,
        [key]: value,
      },
    });
  };

  const selectedTemplate = templates.find(t => t._id === testEmail.templateId);

  return (
    <div className="space-y-6">
      <form onSubmit={handleTestEmailSubmit} className="space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded relative" role="alert">
            <span className="block sm:inline">{error}</span>
          </div>
        )}
        {success && (
          <div className="bg-green-50 border border-green-200 text-green-600 px-4 py-3 rounded relative" role="alert">
            <span className="block sm:inline">{success}</span>
          </div>
        )}
        
        {/* Toggle Send Mode */}
        <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 space-y-3">
          <label className="block text-sm font-semibold text-gray-900">
            Delivery Configuration
          </label>
          <div className="flex flex-wrap gap-6">
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-700 font-medium">Send To:</span>
              <label className="inline-flex items-center">
                <input
                  type="radio"
                  name="sendMode"
                  value="single"
                  checked={testEmail.sendMode === 'single'}
                  onChange={() => setTestEmail({ ...testEmail, sendMode: 'single' })}
                  className="text-indigo-600 focus:ring-indigo-500"
                />
                <span className="ml-2 text-sm text-gray-900">Single Recipient</span>
              </label>
              <label className="inline-flex items-center">
                <input
                  type="radio"
                  name="sendMode"
                  value="group"
                  checked={testEmail.sendMode === 'group'}
                  onChange={() => setTestEmail({ ...testEmail, sendMode: 'group' })}
                  className="text-indigo-600 focus:ring-indigo-500"
                />
                <span className="ml-2 text-sm text-gray-900">Contact Group</span>
              </label>
            </div>

            <div className="flex items-center">
              <label className="inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={testEmail.useQueue}
                  onChange={(e) => setTestEmail({ ...testEmail, useQueue: e.target.checked })}
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                />
                <span className="ml-2 text-sm text-gray-900 font-medium">
                  Queue messages via worker (reproduces background timeouts)
                </span>
              </label>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
          {testEmail.sendMode === 'single' ? (
            <div className="sm:col-span-3">
              <label htmlFor="to" className="block text-sm font-medium text-gray-900">
                Recipient Email
              </label>
              <input
                type="email"
                name="to"
                id="to"
                value={testEmail.to}
                onChange={(e) => setTestEmail({ ...testEmail, to: e.target.value })}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm bg-white text-gray-900 placeholder-gray-400"
                placeholder="recipient@example.com"
                required={testEmail.sendMode === 'single'}
              />
            </div>
          ) : (
            <div className="sm:col-span-3">
              <label htmlFor="groupId" className="block text-sm font-medium text-gray-900">
                Contact Group
              </label>
              <select
                name="groupId"
                id="groupId"
                value={testEmail.groupId}
                onChange={(e) => setTestEmail({ ...testEmail, groupId: e.target.value })}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm bg-white text-gray-900 placeholder-gray-400"
                required={testEmail.sendMode === 'group'}
              >
                <option value="">Select a group</option>
                {groups.map((group) => (
                  <option key={group._id} value={group._id}>
                    {group.name} ({group.emails.length} emails)
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="sm:col-span-3">
            <label htmlFor="template" className="block text-sm font-medium text-gray-900">
              Template
            </label>
            <select
              name="template"
              id="template"
              value={testEmail.templateId}
              onChange={(e) => setTestEmail({ ...testEmail, templateId: e.target.value })}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm bg-white text-gray-900 placeholder-gray-400"
              required
            >
              <option value="">Select a template</option>
              {templates.map((template) => (
                <option key={template._id} value={template._id}>
                  {template.name} ({template.type})
                </option>
              ))}
            </select>
          </div>

          {selectedTemplate && selectedTemplate.type === 'dynamic' && (
            <div className="sm:col-span-6">
              <label className="block text-sm font-medium text-gray-900 mb-2">
                Template Variables
              </label>
              <div className="space-y-4">
                {Object.keys(selectedTemplate.variables || {}).map((key) => (
                  <div key={key} className="flex items-center space-x-4">
                    <label className="block text-sm font-medium text-gray-900 w-24">
                      {key}
                    </label>
                    <input
                      type="text"
                      value={testEmail.variables[key] || ''}
                      onChange={(e) => handleVariableChange(key, e.target.value)}
                      className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm bg-white text-gray-900 placeholder-gray-400"
                      placeholder={`Enter ${key}`}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Preview Section */}
        {selectedTemplate && (
          <div className="mt-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Email Preview</h3>
            <div className="bg-gray-50 rounded-lg p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-900">Subject</label>
                <div className="mt-1 text-sm text-gray-900 bg-white p-2 rounded border border-gray-300">
                  {preview.subject}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-900">Body</label>
                <div className="mt-1 text-sm text-gray-900 bg-white p-2 rounded border border-gray-300 whitespace-pre-wrap">
                  {preview.body}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={loading}
            className={`ml-3 inline-flex justify-center rounded-md border border-transparent bg-indigo-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
              loading ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {loading ? 'Sending...' : 'Send Test Email'}
          </button>
        </div>
      </form>
    </div>
  );
}