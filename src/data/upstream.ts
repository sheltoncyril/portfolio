// Public open-source work done at Red Hat. Each entry is a project I have commits in.
export interface UpstreamProject {
  id: string;
  /** GitHub owner/repo of the public upstream project */
  repo: string;
  title: string;
  summary: string;
  tags: string[];
  /** e.g. "2025 – 2026" */
  span: string;
  show?: boolean;
}

export const upstream = {
  title: 'Open source at Red Hat',
  blurb: '',
};

export const upstreamProjects: UpstreamProject[] = [];

export const visibleUpstream = upstreamProjects.filter((p) => p.show !== false);
