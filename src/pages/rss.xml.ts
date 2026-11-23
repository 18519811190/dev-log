import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getPosts } from '../lib/posts';
import { SITE, url } from '../consts';

export async function GET(context: APIContext) {
  const posts = await getPosts();
  return rss({
    title: `${SITE.title} — ${SITE.tagline}`,
    description: SITE.description,
    site: context.site ?? 'https://example.github.io',
    items: posts.map((post) => ({
      title: post.data.title,
      pubDate: post.data.pubDate,
      description: post.data.description,
      link: url(`/notes/${post.id}`),
      categories: post.data.tags,
    })),
    customData: '<language>zh-cn</language>',
  });
}
