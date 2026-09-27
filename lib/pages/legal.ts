/**
 * The site's legal documents, as content rather than as markup.
 *
 * ── Why a block list and not a page of JSX ──
 *
 * A privacy policy is seventeen sections of the same four shapes: a paragraph,
 * a sub-heading, a bulleted list, a label/value row. Written as JSX every one of
 * those shapes gets re-typed with its own class string, and by section nine two
 * paragraphs disagree about their measure. Held as data, the shapes are declared
 * once in `components/legal/LegalDocumentView.tsx` and the file you edit when the
 * policy changes contains only the policy.
 *
 * It also made the second document — the terms below — a data file and a route
 * rather than a second layout, which is the whole of what this shape bought.
 *
 * ── Where the details come from ──
 *
 * The email and the postal address are read from `lib/contact.ts` rather than
 * typed into the copy, for the reason stated at the top of that file: an address
 * in two places is an address that is wrong in one of them eventually. A policy
 * that names a contact channel the footer no longer uses is worse than most
 * kinds of stale copy, because it is the channel a reader is told to use to
 * exercise a right.
 */

import { CONTACT } from "@/lib/contact";

export type LegalBlock =
  /** One paragraph of body copy. */
  | { kind: "para"; body: string }
  /** A heading below the section title — section 2's two collection routes. */
  | { kind: "sub"; body: string }
  | { kind: "list"; items: string[] }
  /** Label/value rows: the company identification in section 1. */
  | { kind: "fields"; rows: { label: string; value: string }[] }
  /** A sentence the document sets in bold — the no-refunds rule, the closing
   *  acknowledgement. Set apart rather than emboldened inline: these are the
   *  two or three lines a reader must not be able to say they skimmed past. */
  | { kind: "note"; body: string }
  /** The name-address-email plate. Rendered from `CONTACT`, so it carries no
   *  copy of its own and cannot drift from the footer. */
  | { kind: "contact" };

export interface LegalSection {
  /** Section number as the document states it. Also the fragment: `#s7`. */
  n: number;
  title: string;
  blocks: LegalBlock[];
}

export interface LegalDocument {
  title: string;
  /** The date the copy last changed, as a reader should see it. */
  updated: string;
  /** Everything above section 1. */
  intro: LegalBlock[];
  sections: LegalSection[];
  /** Anything below the last section. The terms close on an acknowledgement;
   *  the policy has nothing there, which is why this is optional. */
  outro?: LegalBlock[];
}

export const PRIVACY_POLICY: LegalDocument = {
  title: "Privacy Policy",
  updated: "1 September 2026",

  intro: [
    {
      kind: "para",
      body:
        "Crovion (“Crovion”, “we”, “us”, or “our”) is a registered partnership operating in India and providing digital services including Performance Marketing and Website Development.",
    },
    {
      kind: "para",
      body:
        "This Privacy Policy explains how Crovion collects, uses, stores, processes, and protects information when you visit or interact with our website, https://crovion.com/ (“Website”), or communicate with us regarding our services.",
    },
    {
      kind: "para",
      body:
        "By using our Website or voluntarily providing your information to us, you acknowledge that you have read and understood this Privacy Policy.",
    },
  ],

  sections: [
    {
      n: 1,
      title: "Information about Crovion",
      blocks: [
        {
          kind: "fields",
          rows: [
            { label: "Legal name", value: "Crovion" },
            { label: "Business structure", value: "Registered partnership" },
            { label: "Country", value: "India" },
            {
              label: "Registered/business address",
              value: `${CONTACT.addressLine}`,
            },
            { label: "Website", value: "https://crovion.com/" },
            { label: "Privacy contact", value: CONTACT.email },
            { label: "Support contact", value: CONTACT.email },
          ],
        },
        {
          kind: "para",
          body: `For privacy-related questions, requests, complaints, or concerns, you may contact us at ${CONTACT.email}.`,
        },
      ],
    },

    {
      n: 2,
      title: "Information we collect",
      blocks: [
        {
          kind: "para",
          body:
            "Depending on how you interact with Crovion, we may collect information including:",
        },
        { kind: "sub", body: "Information you provide directly" },
        { kind: "para", body: "This may include:" },
        {
          kind: "list",
          items: [
            "Full name",
            "Email address",
            "Telephone/mobile number",
            "Company or business name",
            "Information provided during enquiries",
            "Information contained in messages or communications sent to us",
            "Information necessary to discuss or provide our services",
            "Billing or transaction-related information where applicable",
          ],
        },
        {
          kind: "para",
          body:
            "Please do not submit sensitive personal information through our Website unless it is specifically requested and necessary for a legitimate purpose.",
        },
        { kind: "sub", body: "Information collected automatically" },
        {
          kind: "para",
          body:
            "When you visit our Website, certain technical information may be collected automatically, which may include:",
        },
        {
          kind: "list",
          items: [
            "IP address",
            "Browser type and version",
            "Device type",
            "Operating system",
            "Approximate location derived from technical information",
            "Pages visited",
            "Time spent on pages",
            "Referring website",
            "Website interaction information",
            "Cookies and similar technologies",
          ],
        },
        {
          kind: "para",
          body:
            "The exact information collected may depend on the technologies and third-party services implemented on the Website from time to time.",
        },
      ],
    },

    {
      n: 3,
      title: "How we use your information",
      blocks: [
        {
          kind: "para",
          body:
            "We may use collected information for legitimate business purposes, including:",
        },
        {
          kind: "list",
          items: [
            "Responding to enquiries and communications",
            "Providing information about our services",
            "Preparing proposals or quotations",
            "Communicating with existing or prospective clients",
            "Providing Performance Marketing services",
            "Providing Website Development services",
            "Managing client relationships",
            "Processing and confirming payments",
            "Maintaining business and financial records",
            "Improving our Website, services, and user experience",
            "Understanding Website usage and performance",
            "Preventing fraud, abuse, unauthorized access, or security incidents",
            "Complying with applicable laws and legal obligations",
            "Protecting the rights, property, and security of Crovion, our clients, and other users",
            "Carrying out other purposes reasonably necessary for our business operations",
          ],
        },
        {
          kind: "para",
          body:
            "We will seek to process personal information only for lawful and relevant purposes.",
        },
      ],
    },

    {
      n: 4,
      title: "Legal basis for processing",
      blocks: [
        {
          kind: "para",
          body:
            "Where applicable, Crovion may process personal data on the basis of consent or other lawful grounds permitted under applicable Indian law.",
        },
        {
          kind: "para",
          body: `Where processing is based on consent, you may withdraw that consent by contacting us at ${CONTACT.email}.`,
        },
        {
          kind: "para",
          body:
            "Withdrawal of consent will not affect processing that was lawfully carried out before withdrawal or processing that may otherwise be permitted or required by law.",
        },
      ],
    },

    {
      n: 5,
      title: "Sharing of information",
      blocks: [
        {
          kind: "para",
          body:
            "Crovion does not sell your personal information as a commercial product.",
        },
        {
          kind: "para",
          body:
            "We may share information where reasonably necessary for legitimate business purposes, including with:",
        },
        {
          kind: "list",
          items: [
            "Service providers assisting us with website hosting, analytics, communications, technology, payment processing, security, or other business operations",
            "Professional advisers where necessary",
            "Government authorities, regulators, courts, or law-enforcement agencies where required or permitted by law",
            "Third parties where disclosure is necessary to protect our legal rights, prevent fraud, investigate security incidents, or enforce our agreements",
            "Other parties where you have provided appropriate authorization or where disclosure is otherwise legally permitted",
          ],
        },
        {
          kind: "para",
          body:
            "Any sharing of information will be undertaken for legitimate purposes and subject to applicable legal requirements.",
        },
      ],
    },

    {
      n: 6,
      title: "Business purposes",
      blocks: [
        {
          kind: "para",
          body:
            "Information may be used internally by Crovion for official business purposes, including client communication, service delivery, business administration, record keeping, analytics, security, and improvement of our services.",
        },
        {
          kind: "para",
          body: "We do not intend to sell personal information to third parties.",
        },
      ],
    },

    {
      n: 7,
      title: "Cookies and similar technologies",
      blocks: [
        {
          kind: "para",
          body: "Our Website may use cookies and similar technologies.",
        },
        { kind: "para", body: "Cookies may be used to:" },
        {
          kind: "list",
          items: [
            "Keep the Website functioning properly",
            "Remember preferences",
            "Understand Website traffic and usage",
            "Improve Website performance",
            "Analyze how visitors interact with the Website",
            "Support security and fraud prevention",
            "Support marketing or advertising functionality where implemented",
          ],
        },
        {
          kind: "para",
          body:
            "You may be able to control or disable cookies through your browser settings.",
        },
        {
          kind: "para",
          body:
            "Disabling certain cookies may affect the functionality or performance of parts of the Website.",
        },
        {
          kind: "para",
          body:
            "Where required by applicable law, Crovion will seek appropriate consent before using non-essential cookies or similar technologies.",
        },
      ],
    },

    {
      n: 8,
      title: "Third-party services",
      blocks: [
        {
          kind: "para",
          body:
            "Our Website or services may, from time to time, use third-party platforms, technologies, tools, or service providers.",
        },
        {
          kind: "para",
          body:
            "These third parties may process information in accordance with their own privacy policies and terms.",
        },
        {
          kind: "para",
          body:
            "Crovion does not control the privacy practices of third-party websites or services and recommends that users review the relevant third-party policies before using those services.",
        },
        {
          kind: "para",
          body:
            "The list of third-party technologies used by the Website may change as the Website develops.",
        },
      ],
    },

    {
      n: 9,
      title: "Data security",
      blocks: [
        {
          kind: "para",
          body:
            "Crovion takes reasonable measures designed to protect personal information against unauthorized access, alteration, disclosure, misuse, loss, or destruction.",
        },
        {
          kind: "para",
          body:
            "However, no electronic transmission, website, storage system, or method of internet communication can be guaranteed to be completely secure.",
        },
        {
          kind: "para",
          body:
            "Accordingly, while we take reasonable precautions, we cannot guarantee absolute security of information transmitted to or stored by us.",
        },
      ],
    },

    {
      n: 10,
      title: "Data retention",
      blocks: [
        {
          kind: "para",
          body:
            "Crovion retains personal information only for as long as reasonably necessary for the purposes for which it was collected, including:",
        },
        {
          kind: "list",
          items: [
            "Providing or managing services",
            "Maintaining business records",
            "Resolving disputes",
            "Enforcing agreements",
            "Meeting accounting, tax, regulatory, or legal requirements",
            "Protecting our legitimate business interests",
          ],
        },
        {
          kind: "para",
          body:
            "When information is no longer reasonably required, Crovion may delete, anonymize, or otherwise securely dispose of it, subject to applicable legal and regulatory requirements.",
        },
      ],
    },

    {
      n: 11,
      title: "Your rights and requests",
      blocks: [
        {
          kind: "para",
          body:
            "Subject to applicable law, you may contact Crovion to request information regarding your personal data or to request:",
        },
        {
          kind: "list",
          items: [
            "Access to relevant personal information",
            "Correction of inaccurate or incomplete information",
            "Deletion of personal information where legally applicable",
            "Withdrawal of consent where processing is based on consent",
            "Information regarding how your personal information is processed",
            "Resolution of privacy-related concerns or complaints",
          ],
        },
        {
          kind: "para",
          body: `Requests should be sent to ${CONTACT.email}.`,
        },
        {
          kind: "para",
          body:
            "We may need to verify your identity before processing certain requests.",
        },
        {
          kind: "para",
          body:
            "Certain requests may be limited or refused where retention or processing is required by law or is otherwise legally permitted.",
        },
      ],
    },

    {
      n: 12,
      title: "Children’s privacy",
      blocks: [
        {
          kind: "para",
          body:
            "Our Website and services are intended for individuals who are 18 years of age or older.",
        },
        {
          kind: "para",
          body:
            "Crovion does not knowingly seek to collect personal information from individuals under 18 through the Website.",
        },
        {
          kind: "para",
          body: `If you believe that a person under 18 has provided personal information to Crovion, please contact us at ${CONTACT.email}.`,
        },
      ],
    },

    {
      n: 13,
      title: "International users",
      blocks: [
        { kind: "para", body: "Crovion primarily operates in India." },
        {
          kind: "para",
          body:
            "If you access our Website or communicate with us from outside India, your information may be processed in India or in other jurisdictions where our service providers operate, subject to applicable law.",
        },
        {
          kind: "para",
          body:
            "By using the Website, you acknowledge that such processing may occur where legally permitted.",
        },
      ],
    },

    {
      n: 14,
      title: "Links to other websites",
      blocks: [
        {
          kind: "para",
          body:
            "Our Website may contain links to third-party websites, social media platforms, or other online services.",
        },
        {
          kind: "para",
          body:
            "Crovion is not responsible for the privacy practices, security, content, or policies of third-party websites.",
        },
        {
          kind: "para",
          body:
            "We encourage users to review the privacy policies of third-party websites before providing personal information.",
        },
      ],
    },

    {
      n: 15,
      title: "Changes to this Privacy Policy",
      blocks: [
        {
          kind: "para",
          body:
            "Crovion may update this Privacy Policy from time to time to reflect changes in:",
        },
        {
          kind: "list",
          items: [
            "Our services",
            "Website functionality",
            "Technology",
            "Applicable laws or regulations",
            "Business practices",
          ],
        },
        {
          kind: "para",
          body:
            "Any updated version will be published on this page with an updated “Last updated” date.",
        },
        {
          kind: "para",
          body:
            "Your continued use of the Website after an updated Privacy Policy is published constitutes acknowledgment of the updated policy to the extent permitted by applicable law.",
        },
      ],
    },

    {
      n: 16,
      title: "Contact us",
      blocks: [
        {
          kind: "para",
          body:
            "For privacy questions, data-related requests, or complaints, contact:",
        },
        { kind: "contact" },
      ],
    },

    {
      n: 17,
      title: "Governing law",
      blocks: [
        {
          kind: "para",
          body:
            "This Privacy Policy shall be governed by and interpreted in accordance with the applicable laws of India.",
        },
        {
          kind: "para",
          body:
            "Any disputes relating to this Privacy Policy shall be subject to the jurisdiction specified in Crovion’s Terms & Conditions.",
        },
      ],
    },
  ],
};

export const TERMS_AND_CONDITIONS: LegalDocument = {
  title: "Terms & Conditions",
  updated: "1 September 2026",

  intro: [
    { kind: "para", body: "Welcome to Crovion." },
    {
      kind: "para",
      body:
        "These Terms & Conditions (“Terms”, “Terms & Conditions”) govern your access to and use of the Crovion website located at https://crovion.com/ (“Website”) and your engagement with Crovion for its services.",
    },
    {
      kind: "para",
      body:
        "By accessing the Website, submitting an enquiry, communicating with Crovion, or engaging Crovion for services, you agree to be bound by these Terms.",
    },
    {
      kind: "para",
      body:
        "If you do not agree with these Terms, please do not use the Website or engage our services.",
    },
  ],

  sections: [
    {
      n: 1,
      title: "About Crovion",
      blocks: [
        {
          kind: "para",
          body: "Crovion is a registered partnership operating in India.",
        },
        {
          kind: "fields",
          rows: [
            { label: "Legal name", value: "Crovion" },
            { label: "Business structure", value: "Registered partnership" },
            { label: "Address", value: `${CONTACT.addressLine}, India` },
            { label: "Website", value: "https://crovion.com/" },
            { label: "Email", value: CONTACT.email },
          ],
        },
        {
          kind: "para",
          body: "Crovion provides digital services including:",
        },
        {
          kind: "list",
          items: [
            "Performance Marketing",
            "Website Development",
            "Related digital services agreed between Crovion and a client",
          ],
        },
        {
          kind: "para",
          body:
            "The exact scope of any project or service may be defined separately through a proposal, quotation, statement of work, invoice, agreement, email confirmation, or other written communication.",
        },
      ],
    },

    {
      n: 2,
      title: "Acceptance of Terms",
      blocks: [
        {
          kind: "para",
          body: "By using the Website or engaging Crovion, you confirm that:",
        },
        {
          kind: "list",
          items: [
            "You are at least 18 years old;",
            "You have the legal capacity to enter into an agreement;",
            "The information you provide to Crovion is accurate and not misleading;",
            "You will use the Website lawfully;",
            "You agree to comply with these Terms.",
          ],
        },
        {
          kind: "para",
          body:
            "If you are acting on behalf of a company or organization, you represent that you have authority to bind that organization.",
        },
      ],
    },

    {
      n: 3,
      title: "Services",
      blocks: [
        {
          kind: "para",
          body:
            "Crovion may provide Performance Marketing, Website Development, and other digital services agreed with a client.",
        },
        { kind: "para", body: "The specific:" },
        {
          kind: "list",
          items: [
            "Deliverables",
            "Project scope",
            "Timeline",
            "Fees",
            "Payment schedule",
            "Revisions",
            "Responsibilities",
            "Technical requirements",
            "Third-party services",
          ],
        },
        {
          kind: "para",
          body:
            "may be defined separately in a proposal, quotation, invoice, statement of work, or other written agreement.",
        },
        {
          kind: "para",
          body:
            "If there is a conflict between these Terms and a specific written agreement signed or accepted by Crovion and the client, the specific written agreement will generally govern the relevant project terms.",
        },
      ],
    },

    {
      n: 4,
      title: "Client responsibilities",
      blocks: [
        {
          kind: "para",
          body:
            "Clients are responsible for providing accurate, complete, and timely information, materials, access credentials, approvals, content, and other resources reasonably required to perform the agreed services.",
        },
        {
          kind: "para",
          body:
            "Clients are responsible for ensuring that any materials they provide to Crovion, including:",
        },
        {
          kind: "list",
          items: [
            "Images",
            "Videos",
            "Text",
            "Logos",
            "Brand assets",
            "Customer data",
            "Advertising materials",
            "Website content",
            "Third-party materials",
          ],
        },
        { kind: "para", body: "may lawfully be used for the intended purpose." },
        {
          kind: "para",
          body:
            "Crovion is not responsible for legal claims arising from materials or instructions supplied by a client where Crovion did not create or independently source those materials.",
        },
      ],
    },

    {
      n: 5,
      title: "Performance Marketing",
      blocks: [
        {
          kind: "para",
          body:
            "Performance Marketing services may involve third-party advertising platforms, including but not limited to Meta, Google, or other advertising platforms.",
        },
        { kind: "para", body: "Crovion does not guarantee:" },
        {
          kind: "list",
          items: [
            "A particular number of leads",
            "Sales",
            "Revenue",
            "Return on investment",
            "Advertising cost",
            "Conversion rate",
            "Search or advertising ranking",
            "Account approval",
            "Ad approval",
            "Continued access to any third-party advertising platform",
          ],
        },
        {
          kind: "para",
          body:
            "Advertising results can be affected by factors outside Crovion’s reasonable control, including market conditions, competition, platform algorithms, advertising policies, audience behavior, website performance, pricing, product quality, and client operations.",
        },
        {
          kind: "para",
          body:
            "Crovion will perform agreed services professionally but cannot guarantee a particular commercial outcome unless expressly agreed in writing.",
        },
      ],
    },

    {
      n: 6,
      title: "Third-party platforms",
      blocks: [
        {
          kind: "para",
          body:
            "Some services may depend on third-party platforms and services.",
        },
        { kind: "para", body: "Third-party platforms may:" },
        {
          kind: "list",
          items: [
            "Change their policies",
            "Change their pricing",
            "Modify algorithms",
            "Restrict accounts",
            "Suspend accounts",
            "Reject advertisements",
            "Experience outages",
            "Modify APIs or functionality",
            "Remove features",
          ],
        },
        {
          kind: "para",
          body:
            "Crovion shall not be responsible for losses caused solely by actions, failures, restrictions, outages, policy changes, or decisions of third-party platforms that are outside Crovion’s reasonable control.",
        },
      ],
    },

    {
      n: 7,
      title: "Website Development",
      blocks: [
        {
          kind: "para",
          body:
            "For Website Development projects, the final scope, features, technology, integrations, timelines, and deliverables will depend on the specific agreement with the client.",
        },
        { kind: "para", body: "Unless expressly agreed otherwise:" },
        {
          kind: "list",
          items: [
            "Third-party hosting, domain, software, plugins, APIs, licenses, and subscriptions may incur separate costs.",
            "Delays caused by the client in providing content, approvals, credentials, or feedback may affect project timelines.",
            "Changes outside the agreed scope may result in additional fees.",
            "Third-party services are subject to their own terms and availability.",
          ],
        },
        {
          kind: "para",
          body:
            "Crovion is not responsible for failures caused by third-party hosting providers, APIs, plugins, payment processors, domain registrars, or other external services.",
        },
      ],
    },

    {
      n: 8,
      title: "Fees and payment",
      blocks: [
        {
          kind: "para",
          body:
            "Fees for Crovion’s services will be communicated to the client through a quotation, proposal, invoice, agreement, or other written communication.",
        },
        { kind: "para", body: "Unless otherwise agreed in writing:" },
        {
          kind: "list",
          items: [
            "Payments must be made according to the agreed payment schedule.",
            "Payments must be made through the payment method communicated by Crovion.",
            "Bank transfers may be used for payment.",
            "Applicable taxes and statutory charges may be payable in addition to quoted fees where required by law.",
            "Crovion may pause or suspend work where agreed payments are overdue.",
          ],
        },
      ],
    },

    {
      n: 9,
      title: "No refunds and cancellations",
      blocks: [
        {
          kind: "note",
          body:
            "Unless expressly agreed otherwise in writing, payments made to Crovion for services are non-refundable and cancellations are not permitted once the service engagement or project has commenced.",
        },
        {
          kind: "para",
          body:
            "This policy applies to advance payments, project payments, service fees, and other amounts paid for agreed services.",
        },
        {
          kind: "para",
          body:
            "Nothing in this section is intended to exclude any right or remedy that cannot legally be excluded under applicable law.",
        },
        {
          kind: "para",
          body:
            "Where Crovion is unable to provide an agreed service due solely to Crovion’s own inability to perform, the parties may discuss an appropriate resolution on a case-by-case basis.",
        },
      ],
    },

    {
      n: 10,
      title: "Intellectual property",
      blocks: [
        { kind: "para", body: "Unless otherwise agreed in writing:" },
        { kind: "sub", body: "Crovion’s intellectual property" },
        {
          kind: "para",
          body: "Crovion retains ownership of its pre-existing:",
        },
        {
          kind: "list",
          items: [
            "Processes",
            "Methods",
            "Frameworks",
            "Templates",
            "Tools",
            "Software components",
            "Internal systems",
            "Know-how",
            "Concepts",
            "Proprietary materials",
            "Branding",
          ],
        },
        {
          kind: "para",
          body:
            "Nothing in these Terms automatically transfers ownership of Crovion’s pre-existing intellectual property to a client.",
        },
        { kind: "sub", body: "Client materials" },
        {
          kind: "para",
          body:
            "The client retains ownership of materials that the client lawfully owns and provides to Crovion.",
        },
        {
          kind: "para",
          body:
            "The client grants Crovion the necessary permission to use such materials solely for providing the agreed services.",
        },
        { kind: "sub", body: "Final deliverables" },
        {
          kind: "para",
          body:
            "Ownership or usage rights in final project deliverables will be determined by the applicable project agreement, proposal, or written arrangement.",
        },
        {
          kind: "para",
          body:
            "Where no separate ownership arrangement exists, Crovion grants the client the rights necessary to use the final paid deliverables for the purpose for which they were created, subject to full payment and any third-party licensing restrictions.",
        },
        { kind: "sub", body: "Portfolio rights" },
        {
          kind: "para",
          body:
            "Unless otherwise agreed in writing, Crovion may identify completed work and display publicly available portions of completed projects in its portfolio, website, social media, presentations, or marketing materials.",
        },
        {
          kind: "para",
          body:
            "Crovion will not intentionally disclose confidential information solely for portfolio purposes.",
        },
      ],
    },

    {
      n: 11,
      title: "Website and content ownership",
      blocks: [
        {
          kind: "para",
          body:
            "The Website, including its design, layout, text, graphics, branding, code, animations, visual elements, and other content, is owned by or licensed to Crovion unless otherwise stated.",
        },
        {
          kind: "para",
          body:
            "You may not reproduce, copy, modify, distribute, sell, publish, reverse engineer, scrape, or commercially exploit the Website or its content without prior written permission from Crovion.",
        },
      ],
    },

    {
      n: 12,
      title: "Prohibited use",
      blocks: [
        { kind: "para", body: "You agree not to:" },
        {
          kind: "list",
          items: [
            "Use the Website for unlawful purposes;",
            "Attempt to gain unauthorized access to the Website or its systems;",
            "Introduce malware, viruses, or malicious code;",
            "Conduct unauthorized security testing;",
            "Scrape or systematically copy Website content;",
            "Interfere with Website functionality;",
            "Impersonate Crovion or its representatives;",
            "Misrepresent your relationship with Crovion;",
            "Use Crovion’s branding without permission;",
            "Use the Website to violate the rights of another person or entity;",
            "Submit fraudulent, misleading, or unlawful information.",
          ],
        },
        {
          kind: "para",
          body:
            "Crovion may restrict or terminate access where reasonably necessary to protect the Website, its users, or its business.",
        },
      ],
    },

    {
      n: 13,
      title: "Warranties and disclaimers",
      blocks: [
        {
          kind: "para",
          body:
            "The Website and its general information are provided on an “as available” basis.",
        },
        {
          kind: "para",
          body:
            "While Crovion makes reasonable efforts to maintain accurate and useful information, we do not guarantee that:",
        },
        {
          kind: "list",
          items: [
            "The Website will always be available;",
            "The Website will be error-free;",
            "All information will always be complete or current;",
            "The Website will be free from viruses or other harmful components;",
            "Every feature will operate without interruption.",
          ],
        },
        {
          kind: "para",
          body:
            "Information on the Website should not be treated as a guarantee of any particular business or marketing result.",
        },
      ],
    },

    {
      n: 14,
      title: "Limitation of liability",
      blocks: [
        {
          kind: "para",
          body:
            "To the maximum extent permitted by applicable law, Crovion shall not be liable for indirect, incidental, consequential, special, exemplary, or punitive damages, including loss of profits, revenue, business opportunities, goodwill, data, or anticipated savings arising from the use of the Website or services.",
        },
        {
          kind: "para",
          body: "Crovion shall not be responsible for losses resulting from:",
        },
        {
          kind: "list",
          items: [
            "Client-provided information or materials;",
            "Client decisions or instructions;",
            "Third-party platform changes;",
            "Advertising platform suspension or rejection;",
            "Third-party service outages;",
            "Hosting failures;",
            "Domain or DNS issues;",
            "API failures;",
            "Market conditions;",
            "Changes in algorithms;",
            "Events outside Crovion’s reasonable control.",
          ],
        },
        {
          kind: "para",
          body:
            "Nothing in these Terms excludes liability that cannot legally be excluded or limited under applicable law.",
        },
      ],
    },

    {
      n: 15,
      title: "Indemnification",
      blocks: [
        {
          kind: "para",
          body:
            "To the extent permitted by law, you agree to indemnify and hold Crovion and its partners, representatives, employees, and service providers harmless from claims, losses, liabilities, damages, costs, and expenses arising from:",
        },
        {
          kind: "list",
          items: [
            "Your breach of these Terms;",
            "Your unlawful use of the Website;",
            "Materials supplied by you;",
            "Your infringement of third-party intellectual property rights;",
            "Your violation of applicable laws;",
            "Your instructions or actions in connection with the services.",
          ],
        },
      ],
    },

    {
      n: 16,
      title: "Confidentiality",
      blocks: [
        {
          kind: "para",
          body:
            "Where Crovion and a client exchange confidential business, technical, financial, or other non-public information, both parties should take reasonable measures to protect such information from unauthorized disclosure.",
        },
        {
          kind: "para",
          body:
            "Confidentiality obligations may be further defined through a separate agreement where required.",
        },
      ],
    },

    {
      n: 17,
      title: "Termination or suspension",
      blocks: [
        {
          kind: "para",
          body:
            "Crovion may suspend or terminate access to the Website or discontinue services where reasonably necessary, including where:",
        },
        {
          kind: "list",
          items: [
            "These Terms are breached;",
            "Payments are overdue;",
            "Fraudulent or unlawful activity is suspected;",
            "Continued access creates a security or legal risk;",
            "A third-party platform or provider prevents the services from continuing;",
            "Required cooperation or information is not provided.",
          ],
        },
        {
          kind: "para",
          body:
            "Termination will not automatically release either party from obligations that accrued before termination.",
        },
      ],
    },

    {
      n: 18,
      title: "Force majeure",
      blocks: [
        {
          kind: "para",
          body:
            "Crovion shall not be responsible for delays or failures caused by circumstances beyond its reasonable control, including natural disasters, government actions, internet or telecommunications failures, cyber incidents, third-party outages, war, civil unrest, strikes, epidemics, infrastructure failures, or other events beyond reasonable control.",
        },
      ],
    },

    {
      n: 19,
      title: "Links to third-party websites",
      blocks: [
        {
          kind: "para",
          body: "The Website may contain links to third-party websites.",
        },
        {
          kind: "para",
          body:
            "Crovion does not control or guarantee the accuracy, availability, security, or policies of third-party websites.",
        },
        {
          kind: "para",
          body:
            "Accessing third-party websites is at your own discretion and subject to their respective terms and policies.",
        },
      ],
    },

    {
      n: 20,
      title: "Changes to these Terms",
      blocks: [
        {
          kind: "para",
          body: "Crovion may update these Terms from time to time.",
        },
        {
          kind: "para",
          body:
            "Updated Terms will be published on the Website with a revised “Last updated” date.",
        },
        {
          kind: "para",
          body:
            "Your continued use of the Website after updated Terms are published constitutes acceptance of the revised Terms to the extent permitted by applicable law.",
        },
      ],
    },

    {
      n: 21,
      title: "Severability",
      blocks: [
        {
          kind: "para",
          body:
            "If any provision of these Terms is determined to be invalid, unlawful, or unenforceable, the remaining provisions will continue to remain in effect to the extent permitted by law.",
        },
      ],
    },

    {
      n: 22,
      title: "Entire agreement",
      blocks: [
        {
          kind: "para",
          body:
            "These Terms, together with any applicable proposal, quotation, invoice, statement of work, or written service agreement, constitute the applicable agreement between Crovion and the user/client regarding the relevant services.",
        },
      ],
    },

    {
      n: 23,
      title: "Governing law and jurisdiction",
      blocks: [
        {
          kind: "para",
          body:
            "These Terms shall be governed by and interpreted in accordance with the laws of India.",
        },
        {
          kind: "para",
          body:
            "Subject to applicable law, courts having jurisdiction in Firozabad, Uttar Pradesh, India shall have exclusive jurisdiction over disputes arising from or relating to these Terms or the use of the Website.",
        },
      ],
    },

    {
      n: 24,
      title: "Contact",
      blocks: [
        {
          kind: "para",
          body:
            "For questions regarding these Terms or Crovion’s services, contact:",
        },
        { kind: "contact" },
      ],
    },
  ],

  outro: [
    {
      kind: "note",
      body:
        "By using the Crovion Website or engaging Crovion for services, you acknowledge that you have read, understood, and agreed to these Terms & Conditions.",
    },
  ],
};
