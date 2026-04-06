import {
  INIT_PUBS, INIT_CLIENTS, INIT_STORIES, INIT_TEAM,
  buildAllIssues, generateSampleSales, generateSampleProposals,
  INIT_NOTIFICATIONS,
} from './seed';

export function buildLocalData() {
  const pubs = INIT_PUBS;
  const issues = buildAllIssues(pubs);
  const clients = INIT_CLIENTS;
  const sales = generateSampleSales(pubs, issues, clients);
  const proposals = generateSampleProposals(pubs, issues, clients);
  return {
    pubs,
    issues,
    stories: INIT_STORIES,
    clients,
    sales,
    proposals,
    team: INIT_TEAM,
    notifications: INIT_NOTIFICATIONS,
  };
}
