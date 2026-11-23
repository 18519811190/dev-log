const base = import.meta.env.BASE_URL || '/';

/** 把站内相对路径拼上 base，保证 GitHub Pages 子路径部署时链接不失效 */
export const url = (path = ''): string => {
  const b = base.replace(/\/$/, '');
  const p = path.replace(/^\//, '');
  return p ? `${b}/${p}` : `${b}/`;
};

export const SITE = {
  brand: '~/dev.log',
  title: 'dev.log',
  tagline: '把踩过的坑写成文档',
  subtitle: '.NET · Vue · 工业物联网 · 协议调试',
  latin: 'notes from the stack',
  description:
    '一个工业物联网与全栈工程的技术笔记：OPC UA / Modbus 协议调试、.NET 采集服务、Vue3 前端性能与现场问题复盘。',
  author: '王梦宇',
  initials: 'WM',
  github: 'https://github.com/example',
  email: 'hello@example.com',
};

export const NAV = [
  { label: '文章', href: '/notes' },
  { label: '标签', href: '/tags' },
  { label: '项目', href: '/projects' },
  { label: '关于', href: '/about' },
];
