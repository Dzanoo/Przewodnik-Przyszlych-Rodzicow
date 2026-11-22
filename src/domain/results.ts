/**
 * Wszystkie wyliczenia dla jednego profilu — wspólne dla frontendu (React) i backendu (REST API).
 * Czysta funkcja: ten sam profil i ta sama data dają ten sam wynik.
 */
import { benefitBase, bridgingMaternity, careAllowance, compareVariants, monthlyMaternity, pregnancySickness } from './benefitCalculator';
import { applicableScenarios, buildChecklist, generateForms } from './documentGenerator';
import {
  buildDeadlines,
  buildTimeline,
  computeEligibility,
  fatherCarriesBenefit,
  maternityDimension,
  parentalDimension,
  partTimeExtension,
  specialCaseIssues,
  supplementaryLeave,
} from './eligibilityEngine';
import { auditRisks } from './riskAuditor';
import type { Profile } from './types';

export function computeResults(profile: Profile, today: string) {
    const eligibility = computeEligibility(profile, today);
    const base = benefitBase(profile, eligibility);
    const motherBase = eligibility.maternityEligible ? base.base : 0;
    const fatherBase = profile.family.otherParent.insured ? profile.family.otherParent.monthlyBase : 0;
    const sickness = pregnancySickness(profile, eligibility, base.base);
    const maternity = maternityDimension(profile, today);
    const supplementary = supplementaryLeave(profile);
    const parental = parentalDimension(profile);
    const partTime = partTimeExtension(profile, parental);
    const comparison = compareVariants(profile, today, motherBase, fatherBase);
    const monthly = {
      full: monthlyMaternity(motherBase, 1, profile.salary.usePit2),
      averaged: monthlyMaternity(motherBase, 0.815, profile.salary.usePit2),
      parental: monthlyMaternity(motherBase, 0.7, profile.salary.usePit2),
    };
    const care = careAllowance(profile, eligibility, base.base);
    const bridging = bridgingMaternity(profile, base.base, today);
    const timeline = buildTimeline(profile, today);
    const deadlines = buildDeadlines(profile, today, eligibility);
    const checklist = buildChecklist(profile, eligibility, today);
    const forms = generateForms(profile, eligibility, today);
    const scenarios = applicableScenarios(profile, eligibility, today);
    const fatherCarries = fatherCarriesBenefit(profile);
    const specialIssues = specialCaseIssues(profile);
    /** Plan urlopów pokazujemy, gdy zasiłek przysługuje matce albo — przy matce bez ubezpieczenia — ojcu. */
    const planVisible = timeline.length > 0 && (eligibility.maternityEligible || fatherCarries);
    const risks = auditRisks(profile, eligibility, base, profile.plan.sickLeavePregnancyDays > 0 ? sickness : null, today);
    return { eligibility, base, motherBase, fatherBase, bridging, sickness, maternity, supplementary, parental, partTime, comparison, monthly, care, timeline, deadlines, checklist, forms, risks, scenarios, fatherCarries, specialIssues, planVisible };
  }

export type Results = ReturnType<typeof computeResults>;
