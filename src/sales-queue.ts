import { PipedriveClient, Activity, Deal, Stage } from './pipedrive-client.js';
import { Cache } from './cache.js';
import { format, toZonedTime } from 'date-fns-tz';
import { parseISO, startOfDay, isBefore } from 'date-fns';

export interface EnrichedActivity {
  id: number;
  subject: string;
  type: string;
  due_date: string;
  due_time: string;
  person_name: string;
  person_email?: string;
  person_phone?: string;
  org_name: string;
  deal_title: string;
  deal_url: string;
  is_overdue: boolean;
}

export interface EnrichedDeal {
  id: number;
  title: string;
  value: number;
  currency: string;
  stage_name: string;
  person_name: string;
  person_email?: string;
  person_phone?: string;
  org_name: string;
  deal_url: string;
  missing_next_action: boolean;
}

export interface SalesQueueDigest {
  generated_at: string;
  timezone: string;
  overdue_activities: EnrichedActivity[];
  today_activities: EnrichedActivity[];
  deals_missing_next_action: EnrichedDeal[];
  summary: {
    total_overdue: number;
    total_today: number;
    total_deals_missing_action: number;
  };
}

export class SalesQueueService {
  private client: PipedriveClient;
  private cache: Cache;
  private timezone = 'Europe/Madrid';
  private stagesCache: Map<number, string> = new Map();

  constructor(apiToken: string) {
    this.client = new PipedriveClient(apiToken);
    this.cache = new Cache();
  }

  private getDealUrl(dealId: number): string {
    // Pipedrive deal URL format
    return `https://app.pipedrive.com/deal/${dealId}`;
  }

  private async loadStages(): Promise<void> {
    const cacheKey = 'stages_all';
    let stages = this.cache.get<Stage[]>(cacheKey);

    if (!stages) {
      stages = await this.client.getAllStages();
      this.cache.set(cacheKey, stages, 3600); // Cache for 1 hour
    }

    this.stagesCache.clear();
    for (const stage of stages) {
      this.stagesCache.set(stage.id, stage.name);
    }
  }

  private async enrichActivity(activity: Activity): Promise<EnrichedActivity> {
    const now = toZonedTime(new Date(), this.timezone);
    const dueDate = parseISO(activity.due_date);
    const isOverdue = isBefore(dueDate, startOfDay(now));

    let personEmail: string | undefined;
    let personPhone: string | undefined;

    if (activity.person_id) {
      const cacheKey = `person_${activity.person_id}`;
      let person = this.cache.get<{ email?: Array<{ value: string; primary: boolean }>; phone?: Array<{ value: string; primary: boolean }> }>(cacheKey);

      if (!person) {
        const fetchedPerson = await this.client.getPerson(activity.person_id);
        if (fetchedPerson) {
          person = fetchedPerson;
          this.cache.set(cacheKey, person, 1800); // Cache for 30 minutes
        }
      }

      if (person) {
        const primaryEmail = person.email?.find((e) => e.primary);
        const primaryPhone = person.phone?.find((p) => p.primary);
        personEmail = primaryEmail?.value || person.email?.[0]?.value;
        personPhone = primaryPhone?.value || person.phone?.[0]?.value;
      }
    }

    return {
      id: activity.id,
      subject: activity.subject,
      type: activity.type,
      due_date: activity.due_date,
      due_time: activity.due_time || '',
      person_name: activity.person_name || 'Unknown',
      person_email: personEmail,
      person_phone: personPhone,
      org_name: activity.org_name || '',
      deal_title: activity.deal_title || '',
      deal_url: activity.deal_id ? this.getDealUrl(activity.deal_id) : '',
      is_overdue: isOverdue,
    };
  }

  private async enrichDeal(deal: Deal): Promise<EnrichedDeal> {
    await this.loadStages();

    let personEmail: string | undefined;
    let personPhone: string | undefined;

    if (deal.person_id) {
      const cacheKey = `person_${deal.person_id}`;
      let person = this.cache.get<{ email?: Array<{ value: string; primary: boolean }>; phone?: Array<{ value: string; primary: boolean }> }>(cacheKey);

      if (!person) {
        const fetchedPerson = await this.client.getPerson(deal.person_id);
        if (fetchedPerson) {
          person = fetchedPerson;
          this.cache.set(cacheKey, person, 1800); // Cache for 30 minutes
        }
      }

      if (person) {
        const primaryEmail = person.email?.find((e) => e.primary);
        const primaryPhone = person.phone?.find((p) => p.primary);
        personEmail = primaryEmail?.value || person.email?.[0]?.value;
        personPhone = primaryPhone?.value || person.phone?.[0]?.value;
      }
    }

    return {
      id: deal.id,
      title: deal.title,
      value: deal.value,
      currency: deal.currency,
      stage_name: this.stagesCache.get(deal.stage_id) || `Stage ${deal.stage_id}`,
      person_name: deal.person_name || 'Unknown',
      person_email: personEmail,
      person_phone: personPhone,
      org_name: deal.org_name || '',
      deal_url: this.getDealUrl(deal.id),
      missing_next_action: !deal.next_activity_id,
    };
  }

  async getSalesQueueDigest(
    overdueFilterId: number,
    todayFilterId: number,
    missingActionFilterId: number,
    maxResults = 50
  ): Promise<SalesQueueDigest> {
    const now = toZonedTime(new Date(), this.timezone);
    const generatedAt = format(now, 'yyyy-MM-dd HH:mm:ss zzz', { timeZone: this.timezone });

    // Fetch overdue activities
    const overdueResponse = await this.client.getActivitiesByFilter(
      overdueFilterId,
      0,
      maxResults
    );
    const overdueActivities = await Promise.all(
      (overdueResponse.data || []).map(activity => this.enrichActivity(activity))
    );

    // Fetch today's activities
    const todayResponse = await this.client.getActivitiesByFilter(
      todayFilterId,
      0,
      maxResults
    );
    const todayActivities = await Promise.all(
      (todayResponse.data || []).map(activity => this.enrichActivity(activity))
    );

    // Fetch deals missing next action
    const missingActionResponse = await this.client.getDealsByFilter(
      missingActionFilterId,
      0,
      maxResults
    );
    const dealsNeedingAction = await Promise.all(
      (missingActionResponse.data || []).map(deal => this.enrichDeal(deal))
    );

    return {
      generated_at: generatedAt,
      timezone: this.timezone,
      overdue_activities: overdueActivities,
      today_activities: todayActivities,
      deals_missing_next_action: dealsNeedingAction,
      summary: {
        total_overdue: overdueActivities.length,
        total_today: todayActivities.length,
        total_deals_missing_action: dealsNeedingAction.length,
      },
    };
  }
}
