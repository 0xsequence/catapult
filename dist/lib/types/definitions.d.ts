import { Action } from './actions';
import { Condition } from './conditions';
import { Value } from './values';
export interface TemplateArgument {
    type: string;
    description?: string;
}
export interface Template {
    type?: 'template';
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
    _path?: string;
}
export interface JobAction {
    name: string;
    template?: string;
    type?: string;
    arguments: Record<string, Value<any>>;
    skip_condition?: Condition[];
    depends_on?: string[];
    output?: boolean | Record<string, Value<any>>;
}
export interface Job {
    name: string;
    version: string;
    description?: string;
    depends_on?: string[];
    actions: JobAction[];
    only_networks?: number[];
    skip_networks?: number[];
    min_evm_version?: string;
    skip_condition?: Condition[];
    constants?: Record<string, Value<any>>;
    deprecated?: boolean;
    _path?: string;
}
export interface ConstantsDocument {
    type: 'constants';
    name?: string;
    constants: Record<string, Value<any>>;
    _path?: string;
}
//# sourceMappingURL=definitions.d.ts.map