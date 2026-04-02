export const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'MoveLeads.cloud',
  url: 'https://moveleads.cloud',
  logo: 'https://moveleads.cloud/favicon.svg',
  description: 'Lead generation platform for moving companies. Get high-quality, verified moving leads delivered to your business.',
  sameAs: [
    'https://twitter.com/moveleads',
    'https://linkedin.com/company/moveleads'
  ],
  contactPoint: {
    '@type': 'ContactPoint',
    url: 'https://moveleads.cloud/contact',
    contactType: 'customer service'
  }
};

export const softwareAppSchema = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'MoveLeads',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  offers: {
    '@type': 'Offer',
    priceCurrency: 'USD',
    description: 'Per lead pricing starting at $10'
  }
};

export const localBusinessSchema = {
  '@context': 'https://schema.org',
  '@type': 'LocalBusiness',
  name: 'MoveLeads.cloud',
  description: 'Lead generation platform for moving companies',
  url: 'https://moveleads.cloud',
  serviceType: 'Lead Generation',
  areaServed: 'United States'
};

export const landingPageFaqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'How are your leads verified?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Every lead goes through email confirmation, phone number validation, and intent scoring. We only accept leads that have actively submitted a moving quote in the last 24 hours.'
      }
    },
    {
      '@type': 'Question',
      name: 'What information is included with each lead?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Full name, phone number, email, origin city/state, destination city/state, home size, estimated move date, and a lead quality score (1–10).'
      }
    },
    {
      '@type': 'Question',
      name: 'Can I filter leads by location?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes. Filter by state, city, zip code radius, or draw a custom service area. You\'ll only see leads that match your coverage.'
      }
    },
    {
      '@type': 'Question',
      name: 'What if a lead turns out to be invalid?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'If a lead has an invalid phone number or is a clear duplicate, contact us within 48 hours for a full credit — no questions asked.'
      }
    },
    {
      '@type': 'Question',
      name: 'Is there a monthly commitment?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'None. Pay-per-lead means you buy exactly what you want, when you want. Pause or stop any time with no penalties.'
      }
    },
    {
      '@type': 'Question',
      name: 'How quickly do leads arrive after I sign up?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Most customers receive their first lead within minutes of signing up and setting their service area.'
      }
    },
    {
      '@type': 'Question',
      name: 'Do you offer exclusive leads?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes — exclusive leads are available on the Pro Bundle plan. Sent to one company only, no competition.'
      }
    }
  ]
};

export function JsonLd({ schema }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

export default JsonLd;
