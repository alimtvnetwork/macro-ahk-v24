import { LovableApiError } from "./lovable-api-error";

const HTTP_OK_MIN = 200;
const HTTP_OK_MAX = 300;
const HEADER_AUTH = "Authorization";
const HEADER_CONTENT_TYPE = "Content-Type";
const HEADER_ACCEPT = "Accept";
const MIME_JSON = "application/json";
const BEARER_PREFIX = "Bearer ";
const EMPTY_JSON_BODY = "{}";

export interface WireRecord {
    [key: string]: string;
}

export type LovableHttpMethod = "GET" | "POST" | "PUT";

export interface LovableHttpRequest {
    method: LovableHttpMethod;
    endpoint: string;
    bearerToken: string;
    jsonBody?: object;
}

const isOk = (status: number): boolean => status >= HTTP_OK_MIN && status < HTTP_OK_MAX;

const buildHeaders = (bearerToken: string, hasBody: boolean): Headers => {
    const headers = new Headers();
    headers.set(HEADER_AUTH, BEARER_PREFIX + bearerToken);
    headers.set(HEADER_ACCEPT, MIME_JSON);

    if (hasBody) {
        headers.set(HEADER_CONTENT_TYPE, MIME_JSON);
    }

    return headers;
};

const buildInit = (request: LovableHttpRequest): RequestInit => {
    const hasBody = request.jsonBody !== undefined;
    const init: RequestInit = {
        method: request.method,
        headers: buildHeaders(request.bearerToken, hasBody),
        credentials: "include",
        mode: "cors",
    };

    if (hasBody) {
        init.body = JSON.stringify(request.jsonBody);
    }

    return init;
};

const readBodyOrThrow = async (response: Response, endpoint: string): Promise<string> => {
    const bodyText = await response.text();

    if (!isOk(response.status)) {
        throw new LovableApiError(`Lovable API ${response.status}`, response.status, endpoint, bodyText);
    }

    return bodyText;
};

const fetchAndParse = async (request: LovableHttpRequest): Promise<object> => {
    const response = await fetch(request.endpoint, buildInit(request));
    const bodyText = await readBodyOrThrow(response, request.endpoint);
    const safeText = bodyText.length === 0 ? EMPTY_JSON_BODY : bodyText;
    const parsed: object = JSON.parse(safeText);

    return parsed;
};

const ensureRecord = (value: object, endpoint: string): WireRecord => {
    if (Array.isArray(value)) {
        throw new LovableApiError("Lovable API returned an array, expected an object", 0, endpoint, "");
    }

    return value as WireRecord;
};

const ensureRecordArray = (value: object, endpoint: string): WireRecord[] => {
    if (!Array.isArray(value)) {
        throw new LovableApiError("Lovable API returned an object, expected an array", 0, endpoint, "");
    }

    return value;
};

export const lovableHttpRecord = async (request: LovableHttpRequest): Promise<WireRecord> => {
    const parsed = await fetchAndParse(request);

    return ensureRecord(parsed, request.endpoint);
};

export const lovableHttpRecordArray = async (request: LovableHttpRequest): Promise<WireRecord[]> => {
    const parsed = await fetchAndParse(request);

    return ensureRecordArray(parsed, request.endpoint);
};
