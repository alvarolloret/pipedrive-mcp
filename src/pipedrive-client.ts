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
  next_activity_id?: number;
  next_activity_date?: string;
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
    };
  };
}

export class PipedriveClient {
  private client: AxiosInstance;
  private baseURL = 'https://api.pipedrive.com/v2';

  constructor(apiToken: string) {
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
    });
  }

  async getActivitiesByFilter(filterId: number, start = 0, limit = 100): Promise<PaginatedResponse<Activity>> {
    const response = await this.client.get(`/activities`, {
      params: {
        filter_id: filterId,
        start,
        limit,
      },
    });
    return response.data;
  }

  async getDealsByFilter(filterId: number, start = 0, limit = 100): Promise<PaginatedResponse<Deal>> {
    const response = await this.client.get(`/deals`, {
      params: {
        filter_id: filterId,
        start,
        limit,
      },
    });
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

  async getOrganization(orgId: number): Promise<Organization | null> {
    try {
      const response = await this.client.get(`/organizations/${orgId}`);
      return response.data.data;
    } catch (error) {
      return null;
    }
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
