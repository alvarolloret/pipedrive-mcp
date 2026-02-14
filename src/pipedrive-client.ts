import axios, { AxiosError, AxiosInstance } from 'axios';

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
  active_flag: boolean;
  user_id: number;
  visible_to: number;
  add_time: string;
  update_time: string;
  custom_view_id?: number;
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

interface PipedriveField {
  id: number;
  key?: string;
  name?: string;
}

interface FilterConditionLeaf {
  object: string;
  field_id: string | number;
  operator: string;
  value?: any;
  extra_value?: any;
}

interface FilterConditionGroup {
  glue: string;
  conditions: Array<FilterConditionGroup | FilterConditionLeaf>;
}

export class PipedriveClient {
  private client: AxiosInstance;
  private baseURL: string;
  private fieldMapCache: Map<string, Map<string, string>>;

  constructor(apiToken: string, baseURL = 'https://api.pipedrive.com/v2') {
    this.baseURL = baseURL;
    this.fieldMapCache = new Map();
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Content-Type': 'application/json',
      },
      params: {
        api_token: apiToken,
      },
    });
  }

  private getV1BaseURL(): string {
    return this.baseURL.replace('/v2', '/v1');
  }

  private shouldUseV1Fallback(error: unknown): error is AxiosError {
    return (
      this.baseURL.includes('/v2') &&
      axios.isAxiosError(error) &&
      error.response?.status === 404
    );
  }

  private toV1CompatibleParams(params?: Record<string, any>): Record<string, any> | undefined {
    if (!params) {
      return params;
    }
    const v1Params: Record<string, any> = { ...params };
    if (v1Params.cursor !== undefined) {
      const start = Number(v1Params.cursor);
      if (!Number.isNaN(start)) {
        v1Params.start = start;
      }
      delete v1Params.cursor;
    }
    return v1Params;
  }

  private normalizePaginatedResponse<T>(payload: any): PaginatedResponse<T> {
    const pagination = payload?.additional_data?.pagination;
    if (
      pagination &&
      pagination.next_cursor === undefined &&
      pagination.next_start !== undefined
    ) {
      pagination.next_cursor = String(pagination.next_start);
    }
    return payload as PaginatedResponse<T>;
  }

  private describeApiError(error: unknown): string {
    if (!axios.isAxiosError(error)) {
      return String(error);
    }

    const responseData = error.response?.data as
      | { error?: string; error_info?: string; message?: string }
      | undefined;
    const apiMessage =
      responseData?.error || responseData?.message || error.message;
    const apiInfo = responseData?.error_info ? ` (${responseData.error_info})` : '';
    return `${apiMessage}${apiInfo}`;
  }

  private getReferenceId(value: unknown): number {
    if (typeof value === 'number') {
      return value;
    }

    if (
      value &&
      typeof value === 'object' &&
      'value' in value &&
      typeof (value as Record<string, unknown>).value === 'number'
    ) {
      return (value as { value: number }).value;
    }

    return 0;
  }

  private getReferenceName(value: unknown): string {
    if (typeof value === 'string') {
      return value;
    }

    if (
      value &&
      typeof value === 'object' &&
      'name' in value &&
      typeof (value as Record<string, unknown>).name === 'string'
    ) {
      return (value as { name: string }).name;
    }

    return '';
  }

  private normalizeDeal(deal: any): Deal {
    return {
      ...deal,
      person_id: this.getReferenceId(deal.person_id),
      person_name: deal.person_name || this.getReferenceName(deal.person_id),
      org_id: this.getReferenceId(deal.org_id),
      org_name: deal.org_name || this.getReferenceName(deal.org_id),
      owner_id: this.getReferenceId(deal.owner_id) || undefined,
      next_activity_id: this.getReferenceId(deal.next_activity_id) || undefined,
    } as Deal;
  }

  private normalizeActivity(activity: any): Activity {
    return {
      ...activity,
      person_id: this.getReferenceId(activity.person_id),
      person_name: activity.person_name || this.getReferenceName(activity.person_id),
      org_id: this.getReferenceId(activity.org_id),
      org_name: activity.org_name || this.getReferenceName(activity.org_id),
      deal_id: this.getReferenceId(activity.deal_id),
      deal_title: activity.deal_title || this.getReferenceName(activity.deal_id),
    } as Activity;
  }

  private normalizeFilterObjectType(value: string): string {
    const normalized = value.trim().toLowerCase();

    switch (normalized) {
      case 'deals':
      case 'deal':
        return 'deal';
      case 'activities':
      case 'activity':
        return 'activity';
      case 'people':
      case 'person':
        return 'person';
      case 'org':
      case 'organization':
      case 'organizations':
        return 'organization';
      case 'products':
      case 'product':
        return 'product';
      case 'projects':
      case 'project':
        return 'project';
      case 'leads':
      case 'lead':
        return 'lead';
      default:
        return normalized;
    }
  }

  private getFieldEndpointForObjectType(objectType: string): string | null {
    switch (objectType) {
      case 'activity':
        return '/activityFields';
      case 'deal':
        return '/dealFields';
      case 'person':
        return '/personFields';
      case 'organization':
        return '/organizationFields';
      case 'product':
        return '/productFields';
      case 'project':
        return '/projectFields';
      default:
        return null;
    }
  }

  private async getFieldMapForObjectType(objectType: string): Promise<Map<string, string>> {
    const normalizedType = this.normalizeFilterObjectType(objectType);
    const cached = this.fieldMapCache.get(normalizedType);
    if (cached) {
      return cached;
    }

    const endpoint = this.getFieldEndpointForObjectType(normalizedType);
    if (!endpoint) {
      return new Map();
    }

    const v1BaseURL = this.getV1BaseURL();
    const response = await this.client.get(`${v1BaseURL}${endpoint}`);
    const fields: PipedriveField[] = response.data?.data || [];

    const fieldMap = new Map<string, string>();
    for (const field of fields) {
      const id = String(field.id);
      fieldMap.set(id, id);
      if (field.key) {
        fieldMap.set(field.key, id);
        fieldMap.set(field.key.toLowerCase(), id);
      }
      if (field.name) {
        fieldMap.set(field.name, id);
        fieldMap.set(field.name.toLowerCase(), id);
      }
    }

    this.fieldMapCache.set(normalizedType, fieldMap);
    return fieldMap;
  }

  private isFilterConditionLeaf(value: unknown): value is FilterConditionLeaf {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const candidate = value as Record<string, unknown>;
    return (
      typeof candidate.object === 'string' &&
      (typeof candidate.field_id === 'string' || typeof candidate.field_id === 'number') &&
      typeof candidate.operator === 'string'
    );
  }

  private isFilterConditionGroup(value: unknown): value is FilterConditionGroup {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const candidate = value as Record<string, unknown>;
    return typeof candidate.glue === 'string' && Array.isArray(candidate.conditions);
  }

  private normalizeFilterRootGroupStructure(conditions: Record<string, any>): FilterConditionGroup {
    const rootGlue = typeof conditions.glue === 'string' ? conditions.glue.toLowerCase() : 'and';
    const rawConditions = Array.isArray(conditions.conditions) ? conditions.conditions : [];

    // Allow shorthand payloads where root conditions are plain leaf conditions.
    if (rawConditions.every(item => this.isFilterConditionLeaf(item))) {
      return {
        glue: rootGlue,
        conditions: [
          { glue: 'and', conditions: rawConditions },
          { glue: 'or', conditions: [] },
        ],
      };
    }

    const groups = rawConditions
      .filter(item => this.isFilterConditionGroup(item))
      .map(group => ({
        glue: group.glue.toLowerCase(),
        conditions: Array.isArray(group.conditions) ? group.conditions : [],
      }));

    const andGroup = groups.find(group => group.glue === 'and') || { glue: 'and', conditions: [] };
    const orGroup = groups.find(group => group.glue === 'or') || { glue: 'or', conditions: [] };

    return {
      glue: rootGlue,
      conditions: [andGroup, orGroup],
    };
  }

  private async normalizeFilterConditionLeaf(
    condition: FilterConditionLeaf,
    defaultObjectType: string
  ): Promise<FilterConditionLeaf> {
    const objectType = this.normalizeFilterObjectType(condition.object || defaultObjectType);
    const rawFieldId = condition.field_id;
    let normalizedFieldId: string | number = rawFieldId;

    if (typeof rawFieldId === 'string' && !/^\d+$/.test(rawFieldId)) {
      const fieldMap = await this.getFieldMapForObjectType(objectType);
      const mappedFieldId =
        fieldMap.get(rawFieldId) ||
        fieldMap.get(rawFieldId.toLowerCase());

      if (!mappedFieldId) {
        throw new Error(
          `Unknown field_id "${rawFieldId}" for object "${objectType}". ` +
          `Use the numeric field ID or a valid field key/name.`
        );
      }

      normalizedFieldId = mappedFieldId;
    }

    return {
      ...condition,
      object: objectType,
      field_id: normalizedFieldId,
      extra_value: condition.extra_value ?? null,
    };
  }

  private async normalizeFilterConditionsRecursive(
    node: FilterConditionGroup | FilterConditionLeaf,
    defaultObjectType: string
  ): Promise<FilterConditionGroup | FilterConditionLeaf> {
    if (this.isFilterConditionLeaf(node)) {
      return this.normalizeFilterConditionLeaf(node, defaultObjectType);
    }

    if (this.isFilterConditionGroup(node)) {
      const normalizedChildren: Array<FilterConditionGroup | FilterConditionLeaf> = [];

      for (const child of node.conditions) {
        if (this.isFilterConditionLeaf(child) || this.isFilterConditionGroup(child)) {
          normalizedChildren.push(
            await this.normalizeFilterConditionsRecursive(child, defaultObjectType)
          );
        }
      }

      return {
        glue: node.glue.toLowerCase(),
        conditions: normalizedChildren,
      };
    }

    return {
      glue: 'and',
      conditions: [],
    };
  }

  private async normalizeFilterConditions(
    conditions: Record<string, any>,
    type: string
  ): Promise<FilterConditionGroup> {
    const normalizedType = this.normalizeFilterObjectType(type);
    const normalizedRoot = this.normalizeFilterRootGroupStructure(conditions);
    const normalized = await this.normalizeFilterConditionsRecursive(
      normalizedRoot,
      normalizedType
    );

    if (!this.isFilterConditionGroup(normalized)) {
      return {
        glue: 'and',
        conditions: [
          { glue: 'and', conditions: [] },
          { glue: 'or', conditions: [] },
        ],
      };
    }

    return normalized;
  }

  private async getWithV1Fallback(path: string, params?: Record<string, any>) {
    try {
      return await this.client.get(path, { params });
    } catch (error) {
      if (!this.shouldUseV1Fallback(error)) {
        throw error;
      }
      return this.client.get(`${this.getV1BaseURL()}${path}`, {
        params: this.toV1CompatibleParams(params),
      });
    }
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

    const response = await this.getWithV1Fallback(`/activities`, params);
    const normalized = this.normalizePaginatedResponse<Activity>(response.data);
    normalized.data = (normalized.data || []).map(activity => this.normalizeActivity(activity));
    return normalized;
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

    const response = await this.getWithV1Fallback(`/deals`, params);
    const normalized = this.normalizePaginatedResponse<Deal>(response.data);
    normalized.data = (normalized.data || []).map(deal => this.normalizeDeal(deal));
    return normalized;
  }

  async getPerson(personId: number): Promise<Person | null> {
    try {
      const response = await this.getWithV1Fallback(`/persons/${personId}`);
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
        const response = await this.getWithV1Fallback(`/persons`, {
          ids: batch.join(','),
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
        const response = await this.getWithV1Fallback(`/deals`, {
          ids: batch.join(','),
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
      const response = await this.getWithV1Fallback(`/organizations/${orgId}`);
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
        const response = await this.getWithV1Fallback(`/organizations`, {
          ids: batch.join(','),
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
      const response = await this.getWithV1Fallback(`/stages/${stageId}`);
      return response.data.data;
    } catch (error) {
      return null;
    }
  }

  async getAllStages(): Promise<Stage[]> {
    const response = await this.getWithV1Fallback(`/stages`);
    return response.data.data || [];
  }

  async getFilters(type?: string): Promise<PipedriveFilter[]> {
    // Filters endpoint is v1 only — derive v1 URL from the configured v2 base
    const v1BaseURL = this.getV1BaseURL();
    const params: Record<string, any> = {};
    const normalizedType = type === 'activities' ? 'activity' : type;
    if (normalizedType) {
      params.type = normalizedType;
    }
    const response = await this.client.get(`${v1BaseURL}/filters`, { params });
    return response.data?.data || [];
  }

  async createFilter(
    name: string,
    type: string,
    conditions: Record<string, any>
  ): Promise<PipedriveFilter> {
    try {
      const v1BaseURL = this.getV1BaseURL();
      const normalizedType = this.normalizeFilterObjectType(type);
      const normalizedConditions = await this.normalizeFilterConditions(
        conditions,
        normalizedType
      );

      const response = await this.client.post(`${v1BaseURL}/filters`, {
        name,
        type: normalizedType === 'organization' ? 'org' : normalizedType,
        conditions: normalizedConditions,
      });
      return response.data.data;
    } catch (error) {
      throw new Error(this.describeApiError(error));
    }
  }

  async deleteFilter(id: number): Promise<number> {
    const v1BaseURL = this.getV1BaseURL();
    const response = await this.client.delete(`${v1BaseURL}/filters/${id}`);
    return response.data.data.id;
  }

  async resolveFilterByName(name: string, type?: string): Promise<PipedriveFilter> {
    const filters = await this.getFilters(type);
    const matches = filters.filter(
      f => f.name.toLowerCase() === name.toLowerCase()
    );

    if (matches.length === 0) {
      throw new Error(
        `No filter found with name "${name}"${type ? ` and type "${type}"` : ''}. ` +
        `Use the miinta.filters.list tool to see available filters.`
      );
    }
    if (matches.length > 1) {
      const ids = matches.map(f => `${f.name} (id=${f.id}, type=${f.type})`).join(', ');
      throw new Error(
        `Multiple filters match name "${name}": ${ids}. ` +
        `Please use the filter ID instead, or provide a more specific name.`
      );
    }
    return matches[0];
  }
}
