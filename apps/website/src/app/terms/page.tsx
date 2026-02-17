import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service — NVRemote',
  description: 'NVRemote terms of service — rules and guidelines for using the platform.',
};

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-6 py-24 sm:py-32">
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight mb-2">
          Terms of Service
        </h1>
        <p className="text-sm text-gray-400 mb-12">
          Last updated: February 15, 2026
        </p>

        <div className="prose prose-gray max-w-none space-y-8 text-gray-600 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">1. Acceptance of Terms</h2>
            <p>
              By accessing or using the NVRemote platform, including our website, desktop clients,
              mobile applications, host agents, and related services (collectively, the
              &quot;Service&quot;), you agree to be bound by these Terms of Service
              (&quot;Terms&quot;). If you do not agree, do not use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">2. Description of Service</h2>
            <p>
              NVRemote is a GPU streaming platform that enables users to remotely access
              NVIDIA-powered computers. The Service includes host agent software, client
              applications, a signaling server, and related infrastructure. NVRemote is currently
              in <strong>alpha</strong> and provided on an as-is basis.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">3. Alpha Software Disclaimer</h2>
            <p>
              The Service is in an early alpha stage. You acknowledge that:
            </p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>Features may be incomplete, unstable, or subject to change without notice</li>
              <li>The Service may contain bugs that could affect performance or reliability</li>
              <li>Availability is not guaranteed &mdash; the Service may experience downtime</li>
              <li>Data formats and APIs may change between versions</li>
              <li>Performance (latency, quality, frame rate) depends on your hardware and network</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">4. Account & Authentication</h2>
            <p>
              You must authenticate via Google OAuth to use the Service. You are responsible for
              maintaining the security of your Google account. You agree to notify us immediately
              of any unauthorized access to your account.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">5. Acceptable Use</h2>
            <p>You agree not to:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>Use the Service for any unlawful purpose</li>
              <li>Stream content you do not have the right to access or distribute</li>
              <li>Attempt to bypass authentication, rate limiting, or security measures</li>
              <li>Interfere with or disrupt the Service or its infrastructure</li>
              <li>Reverse engineer the signaling protocol or attempt to intercept encrypted streams</li>
              <li>Use the Service to mine cryptocurrency or run unrelated batch workloads</li>
              <li>Resell or redistribute access to the Service without authorization</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">6. Intellectual Property</h2>
            <p>
              NVRemote is open-source software licensed under the MIT License. The NVRemote name,
              logo, and branding are trademarks of the NVRemote project. You may use the software
              in accordance with the MIT License but may not use our trademarks without permission.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">7. Content & Streaming</h2>
            <p>
              You are solely responsible for the content you stream through the Service. NVRemote
              does not monitor, store, or have access to your streamed content &mdash; all media
              flows directly between your devices via end-to-end encrypted peer-to-peer connections.
              You represent that you have all necessary rights to any content you stream.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">8. Limitation of Liability</h2>
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, NVREMOTE AND ITS CONTRIBUTORS SHALL NOT BE
              LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES,
              INCLUDING BUT NOT LIMITED TO LOSS OF DATA, LOSS OF PROFITS, OR BUSINESS INTERRUPTION,
              ARISING OUT OF OR IN CONNECTION WITH YOUR USE OF THE SERVICE.
            </p>
            <p className="mt-2">
              THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT
              WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO
              IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND
              NON-INFRINGEMENT.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">9. Termination</h2>
            <p>
              We may suspend or terminate your access to the Service at any time, with or without
              cause, with or without notice. Upon termination, your right to use the Service ceases
              immediately. You may stop using the Service and delete your account at any time.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">10. Changes to Terms</h2>
            <p>
              We reserve the right to modify these Terms at any time. Material changes will be
              communicated by updating the &quot;Last updated&quot; date on this page. Continued
              use of the Service after changes constitutes acceptance of the revised Terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">11. Governing Law</h2>
            <p>
              These Terms shall be governed by and construed in accordance with the laws of the
              State of California, United States, without regard to its conflict of law provisions.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">12. Contact</h2>
            <p>
              If you have questions about these Terms, please open an issue on our{' '}
              <a
                href="https://github.com/thatcooperguy/nvremote"
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
