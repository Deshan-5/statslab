import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/blog', '/careers', '/signin', '/privacy', '/terms'],
      disallow: ['/api/', '/app/'],
    },
    sitemap: 'https://statslab.io/sitemap.xml',
  };
}
