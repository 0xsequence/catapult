import { ResolveJsonValue } from "../values";
import { ValueResolver } from "../../core/resolver";
import { ExecutionContext } from "../../core/context";
import { Network } from "../network";
import { ContractRepository } from "../../contracts/repository";

describe("ResolveJsonValue", () => {
  let resolver: ValueResolver;
  let context: ExecutionContext;
  let mockNetwork: Network;
  let mockRegistry: ContractRepository;

  beforeEach(async () => {
    resolver = new ValueResolver();
    mockRegistry = new ContractRepository();
    // Use a mock RPC URL since resolve-json doesn't need network access
    const rpcUrl = "http://127.0.0.1:8545";
    mockNetwork = {
      name: "testnet",
      chainId: 999,
      rpcUrl,
      supports: ["sourcify", "etherscan_v2"],
      gasLimit: 10000000,
      evmVersion: "cancun",
    };
    // A dummy private key is fine as these tests don't send transactions
    const mockPrivateKey =
      "0x0000000000000000000000000000000000000000000000000000000000000001";
    context = new ExecutionContext(mockNetwork, mockPrivateKey, mockRegistry);
  });

  afterEach(async () => {
    // Clean up context to prevent hanging connections
    if (context) {
      try {
        await context.dispose();
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  });

  describe("type definition", () => {
    it("should have correct type structure for basic JSON", () => {
      const value: ResolveJsonValue = {
        type: "resolve-json",
        arguments: { name: "John", age: 30 },
      };

      expect(value.type).toBe("resolve-json");
      expect(value.arguments).toEqual({ name: "John", age: 30 });
    });

    it("should support nested JSON objects", () => {
      const value: ResolveJsonValue = {
        type: "resolve-json",
        arguments: {
          user: {
            profile: {
              name: "Alice",
              settings: {
                theme: "dark",
                notifications: true,
              },
            },
          },
        },
      };

      expect(value.arguments.user.profile.name).toBe("Alice");
      expect(value.arguments.user.profile.settings.theme).toBe("dark");
    });

    it("should support arrays in JSON", () => {
      const value: ResolveJsonValue = {
        type: "resolve-json",
        arguments: {
          items: ["first", "second", "third"],
          numbers: [1, 2, 3, 4, 5],
        },
      };

      expect(value.arguments.items).toEqual(["first", "second", "third"]);
      expect(value.arguments.numbers).toEqual([1, 2, 3, 4, 5]);
    });

    it("should support mixed data types", () => {
      const value: ResolveJsonValue = {
        type: "resolve-json",
        arguments: {
          string: "hello",
          number: 42,
          boolean: true,
          nullValue: null,
          array: [1, "two", false],
          object: { nested: "value" },
        },
      };

      expect(value.arguments.string).toBe("hello");
      expect(value.arguments.number).toBe(42);
      expect(value.arguments.boolean).toBe(true);
      expect(value.arguments.nullValue).toBeNull();
      expect(value.arguments.array).toEqual([1, "two", false]);
      expect(value.arguments.object.nested).toBe("value");
    });
  });

  describe("basic resolution", () => {
    it("should resolve simple JSON object with primitive values", async () => {
      const value: ResolveJsonValue = {
        type: "resolve-json",
        arguments: { name: "John", age: 30, active: true },
      };

      const result = await resolver.resolve(value, context);
      expect(result).toEqual({ name: "John", age: 30, active: true });
    });

    it("should resolve nested JSON object", async () => {
      const value: ResolveJsonValue = {
        type: "resolve-json",
        arguments: {
          user: {
            id: 1,
            profile: {
              name: "Alice",
              email: "alice@example.com",
            },
          },
        },
      };

      const result = await resolver.resolve(value, context);
      expect(result).toEqual({
        user: {
          id: 1,
          profile: {
            name: "Alice",
            email: "alice@example.com",
          },
        },
      });
    });

    it("should resolve array of primitive values", async () => {
      const value: ResolveJsonValue = {
        type: "resolve-json",
        arguments: [1, 2, 3, "four", "five"],
      };

      const result = await resolver.resolve(value, context);
      expect(result).toEqual([1, 2, 3, "four", "five"]);
    });

    it("should resolve array of objects", async () => {
      const value: ResolveJsonValue = {
        type: "resolve-json",
        arguments: [
          { id: 1, name: "First" },
          { id: 2, name: "Second" },
          { id: 3, name: "Third" },
        ],
      };

      const result = await resolver.resolve(value, context);
      expect(result).toEqual([
        { id: 1, name: "First" },
        { id: 2, name: "Second" },
        { id: 3, name: "Third" },
      ]);
    });

    it("should resolve mixed array with objects and primitives", async () => {
      const value: ResolveJsonValue = {
        type: "resolve-json",
        arguments: [
          "string",
          { id: 1, value: "object" },
          42,
          { nested: { deep: "value" } },
          false,
        ],
      };

      const result = await resolver.resolve(value, context);
      expect(result).toEqual([
        "string",
        { id: 1, value: "object" },
        42,
        { nested: { deep: "value" } },
        false,
      ]);
    });
  });

  describe("template variable resolution", () => {
    it("should resolve template variables in JSON object", async () => {
      context.setOutput("userName", "Alice");
      context.setOutput("userAge", "25");

      const value: ResolveJsonValue = {
        type: "resolve-json",
        arguments: {
          name: "{{userName}}",
          age: "{{userAge}}",
          status: "active",
        },
      };

      const result = await resolver.resolve(value, context);
      expect(result).toEqual({
        name: "Alice",
        age: "25",
        status: "active",
      });
    });

    it("should resolve template variables in nested objects", async () => {
      context.setOutput("theme", "dark");
      context.setOutput("notifications", "true");

      const value: ResolveJsonValue = {
        type: "resolve-json",
        arguments: {
          user: {
            settings: {
              theme: "{{theme}}",
              notifications: "{{notifications}}",
            },
          },
        },
      };

      const result = await resolver.resolve(value, context);
      expect(result).toEqual({
        user: {
          settings: {
            theme: "dark",
            notifications: "true",
          },
        },
      });
    });

    it("should resolve template variables in arrays", async () => {
      context.setOutput("firstItem", "item1");
      context.setOutput("secondItem", "item2");

      const value: ResolveJsonValue = {
        type: "resolve-json",
        arguments: ["{{firstItem}}", "{{secondItem}}", "static"],
      };

      const result = await resolver.resolve(value, context);
      expect(result).toEqual(["item1", "item2", "static"]);
    });

    it("should resolve template variables in array of objects", async () => {
      context.setOutput("id1", "1");
      context.setOutput("name1", "First");
      context.setOutput("id2", "2");
      context.setOutput("name2", "Second");

      const value: ResolveJsonValue = {
        type: "resolve-json",
        arguments: [
          { id: "{{id1}}", name: "{{name1}}" },
          { id: "{{id2}}", name: "{{name2}}" },
        ],
      };

      const result = await resolver.resolve(value, context);
      expect(result).toEqual([
        { id: "1", name: "First" },
        { id: "2", name: "Second" },
      ]);
    });

    it("should resolve deeply nested template variables", async () => {
      context.setOutput(
        "contractAddress",
        "0x1234567890123456789012345678901234567890"
      );
      context.setOutput("functionName", "transfer");
      context.setOutput("amount", "1000000000000000000");

      const value: ResolveJsonValue = {
        type: "resolve-json",
        arguments: {
          transaction: {
            to: "{{contractAddress}}",
            data: {
              function: "{{functionName}}",
              params: {
                amount: "{{amount}}",
              },
            },
          },
        },
      };

      const result = await resolver.resolve(value, context);
      expect(result).toEqual({
        transaction: {
          to: "0x1234567890123456789012345678901234567890",
          data: {
            function: "transfer",
            params: {
              amount: "1000000000000000000",
            },
          },
        },
      });
    });
  });

  describe("complex nested structures", () => {
    it("should resolve complex nested structure with arrays and objects", async () => {
      const value: ResolveJsonValue = {
        type: "resolve-json",
        arguments: {
          blockchain: {
            ethereum: {
              mainnet: {
                contracts: {
                  erc20: [
                    {
                      address: "0xA0b86a33E6441e6e80D0c4C6C7527d72e1d7e4e1",
                      symbol: "USDC",
                      decimals: 6,
                    },
                    {
                      address: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
                      symbol: "DAI",
                      decimals: 18,
                    },
                  ],
                },
              },
            },
          },
        },
      };

      const result = await resolver.resolve(value, context);
      expect(result).toEqual({
        blockchain: {
          ethereum: {
            mainnet: {
              contracts: {
                erc20: [
                  {
                    address: "0xA0b86a33E6441e6e80D0c4C6C7527d72e1d7e4e1",
                    symbol: "USDC",
                    decimals: 6,
                  },
                  {
                    address: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
                    symbol: "DAI",
                    decimals: 18,
                  },
                ],
              },
            },
          },
        },
      });
    });

    it("should resolve structure with mixed template variables and static values", async () => {
      context.setOutput("networkName", "mainnet");
      context.setOutput("chainId", "1");
      context.setOutput("rpcUrl", "https://mainnet.infura.io/v3/abc123");

      const value: ResolveJsonValue = {
        type: "resolve-json",
        arguments: {
          network: {
            name: "{{networkName}}",
            chainId: "{{chainId}}",
            rpcUrl: "{{rpcUrl}}",
            supports: ["etherscan", "sourcify"],
            gasLimit: 10000000,
          },
          contracts: [
            { name: "Token", address: "0x123" },
            { name: "Factory", address: "0x456" },
          ],
        },
      };

      const result = await resolver.resolve(value, context);
      expect(result).toEqual({
        network: {
          name: "mainnet",
          chainId: "1",
          rpcUrl: "https://mainnet.infura.io/v3/abc123",
          supports: ["etherscan", "sourcify"],
          gasLimit: 10000000,
        },
        contracts: [
          { name: "Token", address: "0x123" },
          { name: "Factory", address: "0x456" },
        ],
      });
    });
  });

  describe("edge cases", () => {
    it("should handle empty object", async () => {
      const value: ResolveJsonValue = {
        type: "resolve-json",
        arguments: {},
      };

      const result = await resolver.resolve(value, context);
      expect(result).toEqual({});
    });

    it("should handle empty array", async () => {
      const value: ResolveJsonValue = {
        type: "resolve-json",
        arguments: [],
      };

      const result = await resolver.resolve(value, context);
      expect(result).toEqual([]);
    });

    it("should handle null values", async () => {
      const value: ResolveJsonValue = {
        type: "resolve-json",
        arguments: {
          nullValue: null,
          undefinedValue: undefined,
          emptyString: "",
          zero: 0,
          falseValue: false,
        },
      };

      const result = await resolver.resolve(value, context);
      expect(result).toEqual({
        nullValue: null,
        undefinedValue: undefined,
        emptyString: "",
        zero: 0,
        falseValue: false,
      });
    });

    it("should handle primitive values directly", async () => {
      const stringValue: ResolveJsonValue = {
        type: "resolve-json",
        arguments: "hello world",
      };

      const numberValue: ResolveJsonValue = {
        type: "resolve-json",
        arguments: 42,
      };

      const booleanValue: ResolveJsonValue = {
        type: "resolve-json",
        arguments: true,
      };

      expect(await resolver.resolve(stringValue, context)).toBe("hello world");
      expect(await resolver.resolve(numberValue, context)).toBe(42);
      expect(await resolver.resolve(booleanValue, context)).toBe(true);
    });

    it("should handle deeply nested arrays", async () => {
      const value: ResolveJsonValue = {
        type: "resolve-json",
        arguments: [
          [
            [1, 2, 3],
            ["a", "b", "c"],
          ],
          [[{ id: 1 }, { id: 2 }], [{ name: "test" }]],
        ],
      };

      const result = await resolver.resolve(value, context);
      expect(result).toEqual([
        [
          [1, 2, 3],
          ["a", "b", "c"],
        ],
        [[{ id: 1 }, { id: 2 }], [{ name: "test" }]],
      ]);
    });

    it("should handle large numbers and special values", async () => {
      const value: ResolveJsonValue = {
        type: "resolve-json",
        arguments: {
          largeNumber:
            115792089237316195423570985008687907853269984665640564039457584007913129639935n, // max uint256
          floatNumber: 3.14159,
          negativeNumber: -42,
          scientificNotation: 1e18,
        },
      };

      const result = await resolver.resolve(value, context);
      expect(result).toEqual({
        largeNumber:
          115792089237316195423570985008687907853269984665640564039457584007913129639935n,
        floatNumber: 3.14159,
        negativeNumber: -42,
        scientificNotation: 1e18,
      });
    });
  });

  describe("recursive resolution", () => {
    it("should recursively resolve all nested values", async () => {
      context.setOutput("level1", "resolved1");
      context.setOutput("level2", "resolved2");
      context.setOutput("level3", "resolved3");

      const value: ResolveJsonValue = {
        type: "resolve-json",
        arguments: {
          level1: "{{level1}}",
          nested: {
            level2: "{{level2}}",
            deeper: {
              level3: "{{level3}}",
              array: ["{{level1}}", { value: "{{level2}}" }],
            },
          },
        },
      };

      const result = await resolver.resolve(value, context);
      expect(result).toEqual({
        level1: "resolved1",
        nested: {
          level2: "resolved2",
          deeper: {
            level3: "resolved3",
            array: ["resolved1", { value: "resolved2" }],
          },
        },
      });
    });

    it("should handle circular-like structures without infinite recursion", async () => {
      // This tests that the resolver can handle complex nested structures
      // without getting stuck in infinite loops
      const value: ResolveJsonValue = {
        type: "resolve-json",
        arguments: {
          a: {
            b: {
              c: {
                d: "value",
              },
            },
          },
          e: [
            {
              f: {
                g: "another value",
              },
            },
          ],
        },
      };

      const result = await resolver.resolve(value, context);
      expect(result).toEqual({
        a: {
          b: {
            c: {
              d: "value",
            },
          },
        },
        e: [
          {
            f: {
              g: "another value",
            },
          },
        ],
      });
    });
  });

  describe("integration with other value types", () => {
    it("should work with basic-arithmetic values in JSON", async () => {
      const value: ResolveJsonValue = {
        type: "resolve-json",
        arguments: {
          calculation: {
            type: "basic-arithmetic",
            arguments: { operation: "add", values: [10, 20] },
          },
          static: "value",
        },
      };

      const result = await resolver.resolve(value, context);
      expect(result).toEqual({
        calculation: "30",
        static: "value",
      });
    });

    it("should work with read-json values in JSON", async () => {
      const value: ResolveJsonValue = {
        type: "resolve-json",
        arguments: {
          data: {
            type: "read-json",
            arguments: {
              json: { name: "John", age: 30 },
              path: "name",
            },
          },
          metadata: "extracted",
        },
      };

      const result = await resolver.resolve(value, context);
      expect(result).toEqual({
        data: "John",
        metadata: "extracted",
      });
    });

    it("should work with nested resolve-json values", async () => {
      const value: ResolveJsonValue = {
        type: "resolve-json",
        arguments: {
          outer: {
            type: "resolve-json",
            arguments: {
              inner: {
                type: "resolve-json",
                arguments: {
                  value: "deeply nested",
                },
              },
            },
          },
        },
      };

      const result = await resolver.resolve(value, context);
      expect(result).toEqual({
        outer: {
          inner: {
            value: "deeply nested",
          },
        },
      });
    });

    it("should work with Network() expressions in JSON", async () => {
      const value: ResolveJsonValue = {
        type: "resolve-json",
        arguments: {
          network: {
            chainId: "{{Network().chainId}}",
            name: "{{Network().name}}",
            rpcUrl: "{{Network().rpcUrl}}",
          },
          static: "value",
        },
      };

      const result = await resolver.resolve(value, context);
      expect(result).toEqual({
        network: {
          chainId: 999,
          name: "testnet",
          rpcUrl: "http://127.0.0.1:8545",
        },
        static: "value",
      });
    });

    it("should work with Network() expressions deeply nested in JSON", async () => {
      const value: ResolveJsonValue = {
        type: "resolve-json",
        arguments: {
          config: {
            blockchain: {
              ethereum: {
                networks: {
                  mainnet: {
                    chainId: "{{Network().chainId}}",
                    name: "{{Network().name}}",
                    rpcUrl: "{{Network().rpcUrl}}",
                    supports: "{{Network().supports}}",
                    gasLimit: "{{Network().gasLimit}}",
                  },
                },
                settings: {
                  evmVersion: "{{Network().evmVersion}}",
                  testnet: "{{Network().testnet}}",
                },
              },
            },
            metadata: {
              source: "catapult",
              version: "1.0.0",
            },
          },
          contracts: [
            {
              name: "Token",
              network: "{{Network().name}}",
              chainId: "{{Network().chainId}}",
            },
            {
              name: "Factory",
              rpcUrl: "{{Network().rpcUrl}}",
            },
          ],
        },
      };

      const result = await resolver.resolve(value, context);
      expect(result).toEqual({
        config: {
          blockchain: {
            ethereum: {
              networks: {
                mainnet: {
                  chainId: 999,
                  name: "testnet",
                  rpcUrl: "http://127.0.0.1:8545",
                  supports: ["sourcify", "etherscan_v2"],
                  gasLimit: 10000000,
                },
              },
              settings: {
                evmVersion: "cancun",
                testnet: false,
              },
            },
          },
          metadata: {
            source: "catapult",
            version: "1.0.0",
          },
        },
        contracts: [
          {
            name: "Token",
            network: "testnet",
            chainId: 999,
          },
          {
            name: "Factory",
            rpcUrl: "http://127.0.0.1:8545",
          },
        ],
      });
    });
  });
});
