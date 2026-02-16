import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy — NVRemote',
  description: 'NVRemote privacy policy — how we collect, use, and protect your data.',
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-6 py-24 sm:py-32">
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight mb-2">
          Privacy Policy
        </h1>
        <p className="text-sm text-gray-400 mb-12">
          Last updated: February 15, 2026
        </p>

        <div className="prose prose-gray max-w-none space-y-8 text-gray-600 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">1. Introduction</h2>
            <p>
              NVRemote (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) is committed to protecting
              your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard
              your information when you use the NVRemote platform, including our website, desktop
              clients, mobile applications, host agents, and related services (collectively, the
              &quot;Service&quot;).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">2. Information We Collect</h2>
            <h3 className="text-sm font-semibold text-gray-800 mt-4 mb-2">Account Information</h3>
            <p>
              When you sign in via Google OAuth, we receive your name, email address, and profile
              picture from Google. We do not store your Google password.
            </p>

            <h3 className="text-sm font-semibold text-gray-800 mt-4 mb-2">Session & Telemetry Data</h3>
            <p>
              During streaming sessions, we collect connection metadata (session duration, connection
              type, codec used, resolution, frame rate) and network quality metrics (RTT, packet loss,
              jitter, bitrate). This data is used to optimize streaming quality and diagnose issues.
              We do not capture, store, or transmit the content of your screen or audio streams
              through our servers &mdash; media flows directly between your host and client via
              peer-to-peer encryption (DTLS/SRTP).
            </p>

            <h3 className="text-sm font-semibold text-gray-800 mt-4 mb-2">Host Information</h3>
            <p>
              When you register a host machine, we collect the hostname, GPU model, driver version,
              operating system, and agent version. This information is used for compatibility
              checking, capability negotiation, and troubleshooting.
            </p>

            <h3 className="text-sm font-semibold text-gray-800 mt-4 mb-2">Usage Data</h3>
            <p>
              We collect standard web analytics data including IP address, browser type, pages
              visited, and referring URLs. We use this to improve the Service and understand usage
              patterns.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">3. How We Use Your Information</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Authenticate your identity and manage your account</li>
              <li>Facilitate streaming sessions between your devices</li>
              <li>Optimize streaming quality through adaptive QoS algorithms</li>
              <li>Diagnose and resolve technical issues</li>
              <li>Improve the Service and develop new features</li>
              <li>Communicate important updates about the Service</li>
              <li>Enforce our Terms of Service and protect against abuse</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">4. Data Security</h2>
            <p>
              All streaming media is encrypted end-to-end using DTLS 1.3 and SRTP. Control plane
              communications use TLS 1.3. Authentication tokens are stored securely and rotated
              regularly. We follow industry best practices for data protection, but no method of
              transmission over the Internet is 100% secure.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">5. Data Retention</h2>
            <p>
              Session metadata is retained for 90 days for troubleshooting and analytics purposes.
              Account information is retained as long as your account is active. You may request
              deletion of your account and associated data at any time by contacting us.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">6. Third-Party Services</h2>
            <p>
              We use the following third-party services:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Google Cloud Platform</strong> &mdash; Infrastructure hosting (Cloud Run, Cloud SQL, Cloud DNS)</li>
              <li><strong>Google OAuth</strong> &mdash; Authentication</li>
              <li><strong>Google STUN servers</strong> &mdash; NAT traversal for peer-to-peer connections</li>
            </ul>
            <p className="mt-2">
              These services have their own privacy policies. We encourage you to review them.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">7. Your Rights</h2>
            <p>
              You have the right to access, correct, or delete your personal data. You may also
              request a copy of the data we hold about you. To exercise these rights, contact us at
              the email address below.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">8. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify you of any material
              changes by posting the new policy on this page and updating the &quot;Last updated&quot;
              date.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">9. Contact</h2>
            <p>
              If you have questions about this Privacy Policy, please open an issue on our{' '}
              <a
                href="https://github.com/thatcooperguy/nvstreamer"
                target="_blank"
                rel="noopener noreferrer"
                className="text-nv-green hover:underline"
              >
                GitHub repository
              </a>{' '}
              or contact the project maintainer.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
