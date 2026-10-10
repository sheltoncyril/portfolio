import type { ImageMetadata } from 'astro';
import minirack from '../assets/minirack.png';
import latensee from '../assets/latensee.png';

export type Lane = 'hardware' | 'software';

export interface Project {
  id: string;
  lane: Lane;
  title: string;
  /** Last push to the repo, YYYY-MM-DD. Used for ordering (newest first). */
  date: string;
  summary: string;
  tags: string[];
  repo?: string; // GitHub repo name under sheltoncyril
  live?: string;
  status?: string;
  image?: ImageMetadata;
  imageAlt?: string;
  /** Set to false to hide a project without deleting it. */
  show?: boolean;
}

export const projects: Project[] = [
  {
    id: 'bajada',
    lane: 'software',
    title: 'Bajada',
    date: '2026-09-29',
    summary:
      'Padel score tracker for Apple Watch and iPhone, written in SwiftUI. The HealthKit plumbing is in; scoring is next.',
    tags: ['Swift', 'SwiftUI', 'watchOS', 'HealthKit'],
    repo: 'padel-score-tracker-app',
    status: 'early days',
  },
  {
    id: 'dsa-bible',
    lane: 'software',
    title: 'DSA Bible',
    date: '2026-09-25',
    summary:
      'An interactive MkDocs Material textbook on the data-structure and algorithm ideas that are hardest to hold in your head. Starts with trees and recursion.',
    tags: ['MkDocs', 'Algorithms', 'GitHub Pages'],
    repo: 'DSA-Bible',
    live: 'https://sheltoncyril.github.io/DSA-Bible/',
    status: 'growing',
  },
  {
    id: 'ptouch-print',
    lane: 'hardware',
    title: 'ptouch-print for the PT-P300BT',
    date: '2026-08-03',
    summary:
      'Print labels to a Brother PT-P300BT over Bluetooth from a WebSerial page, a REST API, a CLI or an MCP server, using a reverse-engineered raster protocol.',
    tags: ['Python', 'WebSerial', 'Bluetooth', 'MCP'],
    repo: 'ptouch-print-web',
  },
  {
    id: 'minirack-psu',
    lane: 'hardware',
    title: 'MiniRack Smart PSU',
    date: '2026-07-12',
    summary:
      'A network-controlled DC supply for a 10-inch mini rack: four ports at 5.1, 12 or 19 V and 5 A each, with per-port metering, remote power-cycling and hardware over-voltage protection.',
    tags: ['Power electronics', 'ESP32', 'RP2040', 'ESPHome', 'KiCad'],
    repo: 'minirack-smart-psu',
    status: 'design phase',
    image: minirack,
    imageAlt: 'System overview schematic of the MiniRack Smart PSU: 24 V source, input protection, backplane and four channel modules.',
  },
  {
    id: 'public-key-crypto',
    lane: 'software',
    title: 'Public-key cryptography, explained',
    date: '2026-07-09',
    summary:
      'A single-page interactive explainer of public-key encryption, digital signatures and certificate chains, with live RSA demos using tiny primes so you can follow the arithmetic.',
    tags: ['JavaScript', 'RSA', 'Web Crypto'],
    repo: 'public-key-crypto-explainer',
    live: 'https://sheltoncyril.github.io/public-key-crypto-explainer/',
  },
  {
    id: 'hardcopy',
    lane: 'hardware',
    title: 'Hardcopy',
    date: '2026-07-08',
    summary:
      'Prints your GitHub review requests, mentions and assignments on a thermal receipt printer. Polls the Notifications API, dedupes in SQLite, ships as a Docker image.',
    tags: ['Python', 'ESC/POS', 'SQLite', 'Docker'],
    repo: 'hardcopy',
  },
  {
    id: 'pr-review-rulebook',
    lane: 'software',
    title: 'PR Review Rulebook',
    date: '2026-07-07',
    summary:
      'A rulebook of culture, norms and governance for pull-request review, drawing on how Google, Microsoft, GitLab and Kubernetes do it.',
    tags: ['Code review', 'Engineering culture'],
    repo: 'pr-review-rulebook',
  },
  {
    id: 'latensee',
    lane: 'software',
    title: 'Latensee',
    date: '2026-06-28',
    summary:
      'Cross-platform desktop app that benchmarks public DNS resolvers concurrently, with a live chart, ICMP ping and CSV export.',
    tags: ['Python', 'PyQt6', 'matplotlib', 'DNS'],
    repo: 'latensee',
    image: latensee,
    imageAlt: 'Latensee screenshot: a bar chart of latency for fifteen public DNS resolvers above a sortable results table.',
  },
  {
    id: 'air-quality-v2',
    lane: 'hardware',
    title: 'Air Quality Monitor v2',
    date: '2026-04-28',
    summary:
      'An ESP32-C3 monitor running ESPHome: CO₂, particulates, gas and light sensing, an OLED readout, and everything reported to Home Assistant.',
    tags: ['ESPHome', 'ESP32-C3', 'Home Assistant', 'Sensors'],
    repo: 'air-quality-monitor-v2',
  },
  {
    id: 'sleepy-air-quality',
    lane: 'hardware',
    title: 'Sleepy Air Quality Monitor',
    date: '2025-09-28',
    summary:
      'A low-power air quality sensor on an ESP32-C6 SuperMini with BME680 and SCD4x sensors, reporting over Zigbee. Arduino on PlatformIO.',
    tags: ['ESP32-C6', 'Zigbee', 'PlatformIO', 'C++'],
    repo: 'ESP-32-C6-Sleepy-Air-Quality-Monitor',
  },
];

export const visibleProjects = projects
  .filter((p) => p.show !== false)
  .sort((a, b) => b.date.localeCompare(a.date));
