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
    price: '10',
    priceCurrency: 'USD',
    description: 'Per lead pricing'
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

export function JsonLd({ schema }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

export default JsonLd;
