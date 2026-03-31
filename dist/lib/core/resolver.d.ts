import { Value } from '../types';
import { ExecutionContext } from './context';
export type ResolutionScope = Map<string, any>;
export declare class ValueResolver {
    resolve<T>(value: Value<any>, context: ExecutionContext, scope?: ResolutionScope): Promise<T>;
    private resolveExpression;
    private resolveValueResolverObject;
    private resolveAbiEncode;
    private resolveAbiPack;
    private resolveConstructorEncode;
    private resolveComputeCreate;
    private resolveComputeCreate2;
    private resolveReadBalance;
    private resolveBasicArithmetic;
    private valuesEqual;
    private resolveCall;
    private resolveContractExists;
    private resolveJobCompleted;
    private resolveReadJson;
    private resolveJsonValue;
    private resolveValueEmpty;
    private resolveSliceBytes;
    private computeSliceBounds;
    private parseSliceIndex;
    private normalizeSliceIndex;
    private resolveArguments;
}
//# sourceMappingURL=resolver.d.ts.map