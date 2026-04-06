// useJurisdiction.js — Computes jurisdiction-filtered data for the current user
// Rules:
//   Admin roles (Publisher, EIC, Office Admin): see everything
//   Salespeople: see all their clients (by repId), stats count all client sales
//   Non-admin staff: see data only for their assigned publications
import { useMemo } from 'react';

// Roles that bypass jurisdiction filtering
const ADMIN_ROLES = ['Publisher', 'Editor-in-Chief', 'Office Administrator'];

export function useJurisdiction(currentUser, { pubs, clients, sales, issues, stories, creativeJobs }) {
  const isAdmin = !currentUser || ADMIN_ROLES.includes(currentUser.role);
  const isSalesperson = currentUser && ['Sales Manager', 'Salesperson'].includes(currentUser.role);

  // Resolve assigned pub IDs — 'all' means no filtering
  const assignedPubIds = useMemo(() => {
    if (isAdmin) return null; // null = no filter
    const ap = currentUser?.assigned_pubs || currentUser?.assignedPubs || currentUser?.pubs || [];
    if (ap.includes('all') || ap.length === 0) return null;
    return new Set(ap);
  }, [isAdmin, currentUser]);

  // Filtered publications — what shows in dropdowns and nav
  const myPubs = useMemo(() => {
    if (!pubs) return [];
    if (!assignedPubIds) return pubs;
    return pubs.filter(p => assignedPubIds.has(p.id));
  }, [pubs, assignedPubIds]);

  // Filtered clients
  // Salespeople: all clients where repId matches (client belongs to rep)
  // Non-admin staff: clients with sales in their assigned pubs
  // Admin: all clients
  const myClients = useMemo(() => {
    if (!clients) return [];
    if (!assignedPubIds) return clients; // admin sees all
    if (isSalesperson) {
      // Salespeople see all their clients regardless of pub
      return clients.filter(c => c.repId === currentUser?.id);
    }
    // Non-sales staff: no client filtering (they don't use client views)
    return clients;
  }, [clients, assignedPubIds, isSalesperson, currentUser]);

  // Filtered sales
  // Salespeople: all sales for their clients (client belongs to rep)
  // Non-admin: sales for assigned pubs only
  // Admin: all sales
  const mySales = useMemo(() => {
    if (!sales) return [];
    if (!assignedPubIds) return sales; // admin sees all
    if (isSalesperson) {
      // All sales for rep's clients
      const myClientIds = new Set((clients || []).filter(c => c.repId === currentUser?.id).map(c => c.id));
      return sales.filter(s => myClientIds.has(s.clientId));
    }
    // Non-sales staff: filter by pub
    return sales.filter(s => assignedPubIds.has(s.publication));
  }, [sales, clients, assignedPubIds, isSalesperson, currentUser]);

  // Filtered issues — by assigned pubs
  const myIssues = useMemo(() => {
    if (!issues) return [];
    if (!assignedPubIds) return issues;
    return issues.filter(i => assignedPubIds.has(i.pubId));
  }, [issues, assignedPubIds]);

  // Filtered stories — by assigned pubs
  const myStories = useMemo(() => {
    if (!stories) return [];
    if (!assignedPubIds) return stories;
    return stories.filter(s => assignedPubIds.has(s.publication));
  }, [stories, assignedPubIds]);

  // Filtered creative jobs — by assigned pubs
  const myJobs = useMemo(() => {
    if (!creativeJobs) return [];
    if (!assignedPubIds) return creativeJobs;
    return creativeJobs.filter(j => assignedPubIds.has(j.publicationId));
  }, [creativeJobs, assignedPubIds]);

  return {
    isAdmin,
    isSalesperson,
    assignedPubIds,  // Set or null (null = no filter)
    myPubs,          // Filtered publications for dropdowns
    myClients,       // Filtered clients
    mySales,         // Filtered sales
    myIssues,        // Filtered issues
    myStories,       // Filtered stories
    myJobs,          // Filtered creative jobs
    // Helper: checks if a pub is in jurisdiction
    hasPub: (pubId) => !assignedPubIds || assignedPubIds.has(pubId),
  };
}
