import axios, { AxiosInstance } from 'axios';

export interface Activity {
  id: number;
  subject: string;
  type: string;
  due_date: string;
  due_time: string;
  person_id: number;
  person_name: string;
  org_id: number;
  org_name: string;
  deal_id: number;
  deal_title: string;
  done: boolean;
  marked_as_done_time?: string;
}

export interface Deal {
  id: number;
  title: string;
  value: number;
  currency: string;
  stage_id: number;
  person_id: number;
  person_name: string;
  org_id: number;
  org_name: string;
  status: string;
  add_time: string;
  update_time: string;
  owner_id?: number;
  next_activity_id?: number;
  next_activity_date?: string;
  undone_activities_count?: number;
  last_incoming_mail_time?: string;
  last_outgoing_mail_time?: string;
}

export interface Person {
  id: number;
  name: string;
  email: Array<{ value: string; primary: boolean }>;
  phone: Array<{ value: string; primary: boolean }>;
  org_id: number;
}

export interface Organization {
  id: number;
  name: string;
  address?: string;
  cc_email?: string;
}

export interface Stage {
  id: number;
  name: string;
  pipeline_id: number;
  order_nr: number;
}

export interface PipedriveFilter {
  id: number;
  name: string;
  type: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  additional_data?: {
    pagination?: {
      start: number;
      limit: number;
      more_items_in_collection: boolean;
      next_start?: number;
      next_cursor?: string;
    };
  };
}

export class PipedriveClient {
  private client: AxiosInstance;
  private baseURL: string;

  constructor(apiToken: string, baseURL = 'https://api.pipedrive.com/v2') {
    this.baseURL = baseURL;
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
    });
  }

  async getActivitiesByFilter(
    filterId: number, 
    limit = 100,
    cursor?: string
  ): Promise<PaginatedResponse<Activity>> {
    const params: any = {
      filter_id: filterId,
      done: false,
      sort_by: 'due_date',
      sort_direction: 'asc',
      limit,
    };
    
    if (cursor) {
      params.cursor = cursor;
    }
    
    const response = await this.client.get(`/activities`, { params });
    return response.data;
  }

  async getDealsByFilter(
    filterId: number,
    limit = 100,
    cursor?: string
  ): Promise<PaginatedResponse<Deal>> {
    const params: any = {
      filter_id: filterId,
      status: 'open',
      include_fields: 'undone_activities_count,next_activity_id,last_incoming_mail_time,last_outgoing_mail_time',
      limit,
    };
    
    if (cursor) {
      params.cursor = cursor;
    }
    
    const response = await this.client.get(`/deals`, { params });
    return response.data;
  }

  async getPerson(personId: number): Promise<Person | null> {
    try {
      const response = await this.client.get(`/persons/${personId}`);
      return response.data.data;
    } catch (error) {
      return null;
    }
  }

  async getPersonsBulk(personIds: number[]): Promise<Map<number, Person>> {
    const personsMap = new Map<number, Person>();
    if (personIds.length === 0) return personsMap;

    // Fetch in batches of 100
    for (let i = 0; i < personIds.length; i += 100) {
      const batch = personIds.slice(i, i + 100);
      try {
        const response = await this.client.get(`/persons`, {
          params: { ids: batch.join(',') },
        });
        if (response.data.data) {
          for (const person of response.data.data) {
            personsMap.set(person.id, person);
          }
        }
      } catch (error) {
        // Continue with next batch even if one fails
        console.error(`Error fetching persons batch ${i + 1}-${Math.min(i + batch.length, personIds.length)}: ${error}`);
      }
    }
    return personsMap;
  }

  async getDealsBulk(dealIds: number[]): Promise<Map<number, Deal>> {
    const dealsMap = new Map<number, Deal>();
    if (dealIds.length === 0) return dealsMap;

    // Fetch in batches of 100
    for (let i = 0; i < dealIds.length; i += 100) {
      const batch = dealIds.slice(i, i + 100);
      try {
        const response = await this.client.get(`/deals`, {
          params: { ids: batch.join(',') },
        });
        if (response.data.data) {
          for (const deal of response.data.data) {
            dealsMap.set(deal.id, deal);
          }
        }
      } catch (error) {
        // Continue with next batch even if one fails
        console.error(`Error fetching deals batch ${i + 1}-${Math.min(i + batch.length, dealIds.length)}: ${error}`);
      }
    }
    return dealsMap;
  }

  async getOrganization(orgId: number): Promise<Organization | null> {
    try {
      const response = await this.client.get(`/organizations/${orgId}`);
      return response.data.data;
    } catch (error) {
      return null;
    }
  }

  async getOrganizationsBulk(orgIds: number[]): Promise<Map<number, Organization>> {
    const orgsMap = new Map<number, Organization>();
    if (orgIds.length === 0) return orgsMap;

    // Fetch in batches of 100
    for (let i = 0; i < orgIds.length; i += 100) {
      const batch = orgIds.slice(i, i + 100);
      try {
        const response = await this.client.get(`/organizations`, {
          params: { ids: batch.join(',') },
        });
        if (response.data.data) {
          for (const org of response.data.data) {
            orgsMap.set(org.id, org);
          }
        }
      } catch (error) {
        // Continue with next batch even if one fails
        console.error(`Error fetching organizations batch ${i + 1}-${Math.min(i + batch.length, orgIds.length)}: ${error}`);
      }
    }
    return orgsMap;
  }

  async getStage(stageId: number): Promise<Stage | null> {
    try {
      const response = await this.client.get(`/stages/${stageId}`);
      return response.data.data;
    } catch (error) {
      return null;
    }
  }

  async getAllStages(): Promise<Stage[]> {
    const response = await this.client.get(`/stages`);
    return response.data.data || [];
  }
}
