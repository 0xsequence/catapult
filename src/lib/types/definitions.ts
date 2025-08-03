import { Action } from './actions'
import { Condition } from './conditions'
import { Value } from './values'

// --- Template Definition ---

export interface TemplateArgument {
    type: string; // e.g., 'address', 'bytes32', 'uint256'
    description?: string;
}

export interface Template {
    name: string;
    description?: string;
    arguments?: Record<string, TemplateArgument>;
    returns?: Record<string, TemplateArgument>;
    setup?: {
        skip_condition?: Condition[];
        actions?: Action[];
    };
    actions: Action[];
    skip_condition?: Condition[];
    outputs?: Record<string, Value<any>>;
    _path?: string; // Path to the template file for relative artifact resolution
}

// --- Job Definition ---

export interface JobAction {
    name: string; // Unique name for this action within the job
    template?: string; // Name of the template to use (for template actions)
    type?: string; // Type of primitive action (for primitive actions)
    arguments: Record<string, Value<any>>;
    skip_condition?: Condition[];
    depends_on?: string[];
    /**
     * Output selection/override for this action when writing job outputs.
     * - boolean: legacy flag. true marks the whole action for inclusion, false excludes.
     * - object: custom output map. Keys become output keys under this action's name,
     *           values are Value<any> that will be resolved at job time, overriding template outputs.
     */
    output?: boolean | Record<string, Value<any>>;
}

export interface Job {
    name: string;
    version: string;
    description?: string;
    depends_on?: string[]; // Names of other jobs this job depends on
    actions: JobAction[];
    only_networks?: number[]
    skip_networks?: number[]
    skip_condition?: Condition[];
    constants?: Record<string, Value<any>>; // Optional job-level constants
    _path?: string; // Path to the job file for relative artifact resolution
}

// --- Constants Definition (top-level documents) ---

export interface ConstantsDocument {
    type: 'constants';
    name?: string;
    constants: Record<string, Value<any>>;
    _path?: string; // Source file path
}