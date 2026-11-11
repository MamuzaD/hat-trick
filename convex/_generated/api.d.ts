/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as analyse from "../analyse.js";
import type * as chat from "../chat.js";
import type * as claude from "../claude.js";
import type * as config from "../config.js";
import type * as jobs from "../jobs.js";
import type * as lib_anthropic from "../lib/anthropic.js";
import type * as lib_fetchProject from "../lib/fetchProject.js";
import type * as lib_heuristics from "../lib/heuristics.js";
import type * as lib_prompts from "../lib/prompts.js";
import type * as lib_trader from "../lib/trader.js";
import type * as lib_url from "../lib/url.js";
import type * as teams from "../teams.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  analyse: typeof analyse;
  chat: typeof chat;
  claude: typeof claude;
  config: typeof config;
  jobs: typeof jobs;
  "lib/anthropic": typeof lib_anthropic;
  "lib/fetchProject": typeof lib_fetchProject;
  "lib/heuristics": typeof lib_heuristics;
  "lib/prompts": typeof lib_prompts;
  "lib/trader": typeof lib_trader;
  "lib/url": typeof lib_url;
  teams: typeof teams;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
