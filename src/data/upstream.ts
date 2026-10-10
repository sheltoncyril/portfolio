// Public open-source work done at Red Hat. Each entry is a project where I have commits on the
// upstream default branch. Counts are non-merge commits on that branch. Newest first.
export interface UpstreamProject {
  id: string;
  /** GitHub owner/repo of the public upstream project */
  repo: string;
  title: string;
  summary: string;
  tags: string[];
  /** e.g. "Mar 2025 – Oct 2026" */
  span: string;
  show?: boolean;
}

export const upstream = {
  title: 'Open source at Red Hat',
  blurb:
    'Public projects I commit to as part of my work at Red Hat, mostly around TrustyAI and the Open Data Hub / OpenShift AI platform.',
};

export const upstreamProjects: UpstreamProject[] = [
  {
    id: 'opendatahub-tests',
    repo: 'opendatahub-io/opendatahub-tests',
    title: 'opendatahub-tests',
    summary:
      'The pytest suite for Open Data Hub and OpenShift AI deployments. 66 commits, mostly tests for TrustyAI, LM-Eval, guardrails and garak/EvalHub: TLS to MariaDB, database migration, LLM-as-a-judge evaluations and upgrade checks.',
    tags: ['Python', 'pytest', 'Kubernetes', 'OpenShift AI'],
    span: 'Mar 2025 – Oct 2026',
  },
  {
    id: 'trustyai-service-operator',
    repo: 'trustyai-explainability/trustyai-service-operator',
    title: 'TrustyAI service operator',
    summary:
      'Kubernetes operator that deploys TrustyAI components such as the TrustyAI Service, LM-Eval jobs and EvalHub. 9 commits: KServe v0.17 deployment-mode handling, an OpenTelemetry CVE bump, a conftest policy and a pod-creation race fix in the LM-Eval controller.',
    tags: ['Go', 'Kubernetes', 'Operators', 'KServe'],
    span: 'May – Jul 2026',
  },
  {
    id: 'opendatahub-operator',
    repo: 'opendatahub-io/opendatahub-operator',
    title: 'opendatahub-operator',
    summary:
      'The main operator for Open Data Hub. 2 fixes: the NeMo Guardrails server image mapping, and TrustyAI upgrades that stalled on a stale immutable Deployment selector.',
    tags: ['Go', 'Kubernetes', 'Operators'],
    span: 'Mar – Jun 2026',
  },
  {
    id: 'odh-build-config',
    repo: 'opendatahub-io/ODH-Build-Config',
    title: 'ODH-Build-Config',
    summary:
      'Build and release configuration for Open Data Hub. 5 commits wiring in the related images for eval-hub, NeMo Guardrails and the garak provider.',
    tags: ['Release engineering', 'Tekton', 'Containers'],
    span: 'Apr – May 2026',
  },
  {
    id: 'openshift-python-wrapper',
    repo: 'RedHatQE/openshift-python-wrapper',
    title: 'openshift-python-wrapper',
    summary:
      'A Python wrapper around the Kubernetes client with a unified resource interface. Added the EvalHub, MLflow, MLflowConfig and NemoGuardrails resources.',
    tags: ['Python', 'Kubernetes', 'OpenShift'],
    span: 'Apr 2026',
  },
  {
    id: 'odh-cli',
    repo: 'opendatahub-io/odh-cli',
    title: 'odh-cli',
    summary: 'A command-line tool for working with OpenShift AI deployments. Added bash and oc completions.',
    tags: ['Go', 'CLI', 'OpenShift AI'],
    span: 'Feb 2026',
  },
];

export const visibleUpstream = upstreamProjects.filter((p) => p.show !== false);
