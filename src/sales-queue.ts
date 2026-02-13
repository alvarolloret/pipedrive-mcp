import { PipedriveClient, Activity, Deal, Stage, Person, Organization, PipedriveFilter } from './pipedrive-client.js';
import { Cache } from './cache.js';
import { format, toZonedTime } from 'date-fns-tz';
import { parseISO, startOfDay, isBefore, differenceInDays } from 'date-fns';

// Output format interfaces matching the spec
export interface ActivityItem {
  activity_id: number;
  activity_subject: string;
  activity_type: string;
  due_date: string;
  days_overdue?: number;
  deal: {
    deal_id: number;
    title: string;
    stage_id: number;
    stage_name: string;
    url: string;
  } | null;
  person: {
    id: number;
    name: string;
    email?: string;
  } | null;
  org: {
    id: number;
    name: string;
  } | null;
}

export interface DealItem {
  deal_id: number;
  title: string;
  stage_id: number;
  stage_name: string;
  owner_id?: number;
  undone_activities_count?: number;
  next_activity_id: number | null;
  last_outgoing_mail_time: string | null;
  last_incoming_mail_time: string | null;
  url: string;
  person: {
    id: number;
    name: string;
  } | null;
  org: {
    id: number;
    name: string;
  } | null;
}

export interface SalesQueueDigest {
  generated_at: string;
  timezone: string;
  sections: {
    overdue: ActivityItem[];
    due_today: ActivityItem[];
    missing_next_action: DealItem[];
  };
  stats: {
    overdue_count: number;
    due_today_count: number;
    missing_next_action_count: number;
  };
  source: {
    filter_ids: {
      overdue_activities_filter_id: number;
      today_activities_filter_id: number;
      missing_next_action_deals_filter_id: number;
    };
  };
}

export class SalesQueueService {
  private client: PipedriveClient;
  private cache: Cache;
  private timezone: string;
  private companyDomain: string;
  private cacheTTL: number;

  constructor(
    apiToken: string,
    baseURL = 'https://api.pipedrive.com/v2',
    companyDomain = 'app.pipedrive.com',
    timezone = 'Europe/Madrid',
    cacheTTL = 3600
  ) {
    this.client = new PipedriveClient(apiToken, baseURL);
    this.cache = new Cache();
    this.companyDomain = companyDomain;
    this.timezone = timezone;
    this.cacheTTL = cacheTTL;
  }

  async listFilters(type?: string): Promise<PipedriveFilter[]> {
    const cacheKey = `filters_${type || 'all'}`;
    let filters = this.cache.get<PipedriveFilter[]>(cacheKey);
    if (!filters) {
      filters = await this.client.getFilters(type);
      this.cache.set(cacheKey, filters, this.cacheTTL);
    }
    return filters;
  }

  async resolveFilterId(value: number | string, expectedType?: string): Promise<number> {
    if (typeof value === 'number') {
      return value;
    }
    const filter = await this.client.resolveFilterByName(value, expectedType);
    return filter.id;
  }

  private getDealUrl(dealId: number): string {
    return `https://${this.companyDomain}/deal/${dealId}`;
  }

  private async loadStages(): Promise<Map<number, string>> {
    const cacheKey = 'stages_all';
    let stages = this.cache.get<Stage[]>(cacheKey);

    if (!stages) {
      stages = await this.client.getAllStages();
      this.cache.set(cacheKey, stages, this.cacheTTL);
    }

    const stagesMap = new Map<number, string>();
    for (const stage of stages) {
      stagesMap.set(stage.id, stage.name);
    }
    return stagesMap;
  }

  private async fetchAllActivitiesByFilter(
    filterId: number,
    limit: number
  ): Promise<Activity[]> {
    const activities: Activity[] = [];
    let cursor: string | undefined = undefined;

    while (activities.length < limit) {
      const batchLimit = Math.min(100, limit - activities.length);
      const response = await this.client.getActivitiesByFilter(filterId, batchLimit, cursor);
      
      if (response.data && response.data.length > 0) {
        activities.push(...response.data);
      }
      
      // Check if there are more items to fetch
      const nextCursor = response.additional_data?.pagination?.next_cursor;
      if (!nextCursor || activities.length >= limit) {
        break;
      }
      cursor = nextCursor;
    }

    return activities.slice(0, limit);
  }

  private async fetchAllDealsByFilter(
    filterId: number,
    limit: number
  ): Promise<Deal[]> {
    const deals: Deal[] = [];
    let cursor: string | undefined = undefined;

    while (deals.length < limit) {
      const batchLimit = Math.min(100, limit - deals.length);
      const response = await this.client.getDealsByFilter(filterId, batchLimit, cursor);
      
      if (response.data && response.data.length > 0) {
        deals.push(...response.data);
      }
      
      // Check if there are more items to fetch
      const nextCursor = response.additional_data?.pagination?.next_cursor;
      if (!nextCursor || deals.length >= limit) {
        break;
      }
      cursor = nextCursor;
    }

    return deals.slice(0, limit);
  }

  private enrichActivity(
    activity: Activity,
    stagesMap: Map<number, string>,
    dealsMap: Map<number, Deal>,
    personsMap: Map<number, Person>,
    orgsMap: Map<number, Organization>,
    now: Date
  ): ActivityItem {
    const dueDate = startOfDay(parseISO(activity.due_date));
    const nowStartOfDay = startOfDay(now);
    const daysOverdue = isBefore(dueDate, nowStartOfDay) 
      ? differenceInDays(nowStartOfDay, dueDate)
      : undefined;

    let deal = null;
    if (activity.deal_id) {
      const dealData = dealsMap.get(activity.deal_id);
      const stageId = dealData?.stage_id || 0;
      deal = {
        deal_id: activity.deal_id,
        title: activity.deal_title || dealData?.title || '',
        stage_id: stageId,
        stage_name: stageId ? (stagesMap.get(stageId) || `Stage ${stageId}`) : '',
        url: this.getDealUrl(activity.deal_id),
      };
    }

    let person = null;
    if (activity.person_id) {
      const personData = personsMap.get(activity.person_id);
      person = {
        id: activity.person_id,
        name: activity.person_name || 'Unknown',
        email: personData?.email?.find(e => e.primary)?.value || personData?.email?.[0]?.value,
      };
    }

    let org = null;
    if (activity.org_id) {
      const orgData = orgsMap.get(activity.org_id);
      org = {
        id: activity.org_id,
        name: activity.org_name || orgData?.name || 'Unknown',
      };
    }

    return {
      activity_id: activity.id,
      activity_subject: activity.subject,
      activity_type: activity.type,
      due_date: activity.due_date,
      days_overdue: daysOverdue,
      deal,
      person,
      org,
    };
  }

  private enrichDeal(
    deal: Deal,
    stagesMap: Map<number, string>,
    personsMap: Map<number, Person>,
    orgsMap: Map<number, Organization>
  ): DealItem {
    let person = null;
    if (deal.person_id) {
      const personData = personsMap.get(deal.person_id);
      person = {
        id: deal.person_id,
        name: deal.person_name || personData?.name || 'Unknown',
      };
    }

    let org = null;
    if (deal.org_id) {
      const orgData = orgsMap.get(deal.org_id);
      org = {
        id: deal.org_id,
        name: deal.org_name || orgData?.name || 'Unknown',
      };
    }

    return {
      deal_id: deal.id,
      title: deal.title,
      stage_id: deal.stage_id,
      stage_name: stagesMap.get(deal.stage_id) || `Stage ${deal.stage_id}`,
      owner_id: deal.owner_id,
      undone_activities_count: deal.undone_activities_count,
      next_activity_id: deal.next_activity_id || null,
      last_outgoing_mail_time: deal.last_outgoing_mail_time || null,
      last_incoming_mail_time: deal.last_incoming_mail_time || null,
      url: this.getDealUrl(deal.id),
      person,
      org,
    };
  }

  async getSalesQueueDigest(
    overdueFilterId: number,
    todayFilterId: number,
    missingActionFilterId: number,
    limits: { overdue: number; today: number; missing: number },
    timezone?: string,
    now?: Date,
    includePeopleOrgs = true
  ): Promise<SalesQueueDigest> {
    const tz = timezone || this.timezone;
    const currentTime = now ? toZonedTime(now, tz) : toZonedTime(new Date(), tz);
    const generatedAt = format(currentTime, "yyyy-MM-dd'T'HH:mm:ssXXX", { timeZone: tz });

    // Load stages map
    const stagesMap = await this.loadStages();

    // Fetch all data
    const [overdueActivities, todayActivities, missingActionDeals] = await Promise.all([
      this.fetchAllActivitiesByFilter(overdueFilterId, limits.overdue),
      this.fetchAllActivitiesByFilter(todayFilterId, limits.today),
      this.fetchAllDealsByFilter(missingActionFilterId, limits.missing),
    ]);

    // Collect all person, org, and deal IDs for bulk fetching
    let personsMap = new Map<number, Person>();
    let orgsMap = new Map<number, Organization>();
    let dealsMap = new Map<number, Deal>();

    if (includePeopleOrgs) {
      const personIds = new Set<number>();
      const orgIds = new Set<number>();
      const dealIds = new Set<number>();

      // Collect IDs from activities
      for (const activity of [...overdueActivities, ...todayActivities]) {
        if (activity.person_id) personIds.add(activity.person_id);
        if (activity.org_id) orgIds.add(activity.org_id);
        if (activity.deal_id) dealIds.add(activity.deal_id);
      }

      // Collect IDs from deals
      for (const deal of missingActionDeals) {
        if (deal.person_id) personIds.add(deal.person_id);
        if (deal.org_id) orgIds.add(deal.org_id);
      }

      // Bulk fetch persons, orgs, and deals
      [personsMap, orgsMap, dealsMap] = await Promise.all([
        this.client.getPersonsBulk(Array.from(personIds)),
        this.client.getOrganizationsBulk(Array.from(orgIds)),
        this.client.getDealsBulk(Array.from(dealIds)),
      ]);
    }

    // Enrich the data
    const overdueItems = overdueActivities.map(activity =>
      this.enrichActivity(activity, stagesMap, dealsMap, personsMap, orgsMap, currentTime)
    );

    const todayItems = todayActivities.map(activity =>
      this.enrichActivity(activity, stagesMap, dealsMap, personsMap, orgsMap, currentTime)
    );

    const missingActionItems = missingActionDeals.map(deal =>
      this.enrichDeal(deal, stagesMap, personsMap, orgsMap)
    );

    return {
      generated_at: generatedAt,
      timezone: tz,
      sections: {
        overdue: overdueItems,
        due_today: todayItems,
        missing_next_action: missingActionItems,
      },
      stats: {
        overdue_count: overdueItems.length,
        due_today_count: todayItems.length,
        missing_next_action_count: missingActionItems.length,
      },
      source: {
        filter_ids: {
          overdue_activities_filter_id: overdueFilterId,
          today_activities_filter_id: todayFilterId,
          missing_next_action_deals_filter_id: missingActionFilterId,
        },
      },
    };
  }
}
