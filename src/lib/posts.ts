import { getCollection, type CollectionEntry } from 'astro:content';

export type Post = CollectionEntry<'posts'>;

/** 生产构建时不暴露草稿 */
const visible = (p: Post) => import.meta.env.PROD && p.data.draft ? false : !p.data.draft;

export async function getPosts(): Promise<Post[]> {
  const all = await getCollection('posts');
  return all
    .filter(visible)
    .sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}

export async function getTags(): Promise<{ tag: string; count: number }[]> {
  const posts = await getPosts();
  const map = new Map<string, number>();
  for (const p of posts) {
    for (const t of p.data.tags) map.set(t, (map.get(t) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

export function formatDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}.${m}.${day}`;
}

/** 中文按字、英文按词，约 350 字/分钟 */
export function readingTime(body: string | undefined): number {
  if (!body) return 1;
  const cjk = (body.match(/[\u4e00-\u9fa5]/g) ?? []).length;
  const words = (body.match(/[A-Za-z0-9_]+/g) ?? []).length;
  const minutes = Math.ceil((cjk + words * 1.6) / 350);
  return Math.max(1, minutes);
}

export function postPath(p: Post): string {
  return `${urlOf(p.id)}`;
}

/** entry.id 是相对 content/posts 的路径去扩展名，直接当 slug */
function urlOf(id: string): string {
  return `/notes/${id.replace(/\.md$/, '')}`;
}
