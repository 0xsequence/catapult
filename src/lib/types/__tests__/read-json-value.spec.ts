import { ReadJsonValue } from '../values'

describe('ReadJsonValue', () => {
  describe('type definition', () => {
    it('should have correct type structure for basic path', () => {
      const value: ReadJsonValue = {
        type: 'read-json',
        arguments: {
          json: { name: 'John', age: 30 },
          path: 'name'
        }
      }
      
      expect(value.type).toBe('read-json')
      expect(value.arguments.json).toEqual({ name: 'John', age: 30 })
      expect(value.arguments.path).toBe('name')
    })

    it('should support nested path access', () => {
      const value: ReadJsonValue = {
        type: 'read-json',
        arguments: {
          json: {
            txs: {
              to: '0x596aF90CecdBF9A768886E771178fd5561dD27Ab',
              data: '0x1234'
            }
          },
          path: 'txs.data'
        }
      }
      
      expect(value.arguments.path).toBe('txs.data')
    })

    it('should support deeply nested path access', () => {
      const value: ReadJsonValue = {
        type: 'read-json',
        arguments: {
          json: {
            user: {
              profile: {
                personal: {
                  name: 'Alice'
                }
              }
            }
          },
          path: 'user.profile.personal.name'
        }
      }
      
      expect(value.arguments.path).toBe('user.profile.personal.name')
    })

    it('should support array index access', () => {
      const value: ReadJsonValue = {
        type: 'read-json',
        arguments: {
          json: {
            transactions: [
              { hash: '0xabc123' },
              { hash: '0xdef456' }
            ]
          },
          path: 'transactions.0.hash'
        }
      }
      
      expect(value.arguments.path).toBe('transactions.0.hash')
    })

    it('should support template variables in json', () => {
      const value: ReadJsonValue = {
        type: 'read-json',
        arguments: {
          json: '{{apiResponse}}',
          path: 'result.data'
        }
      }
      
      expect(value.arguments.json).toBe('{{apiResponse}}')
    })

    it('should support template variables in path', () => {
      const value: ReadJsonValue = {
        type: 'read-json',
        arguments: {
          json: { data: { field1: 'value1', field2: 'value2' } },
          path: '{{fieldPath}}'
        }
      }
      
      expect(value.arguments.path).toBe('{{fieldPath}}')
    })

    it('should support both json and path as template variables', () => {
      const value: ReadJsonValue = {
        type: 'read-json',
        arguments: {
          json: '{{responseData}}',
          path: '{{extractionPath}}'
        }
      }
      
      expect(value.arguments.json).toBe('{{responseData}}')
      expect(value.arguments.path).toBe('{{extractionPath}}')
    })

    it('should work with complex JSON structures', () => {
      const complexJson = {
        blockchain: {
          ethereum: {
            mainnet: {
              contracts: {
                erc20: [
                  {
                    address: '0xA0b86a33E6441e6e80D0c4C6C7527d72e1d7e4e1',
                    symbol: 'USDC',
                    decimals: 6
                  },
                  {
                    address: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
                    symbol: 'DAI',
                    decimals: 18
                  }
                ]
              }
            }
          }
        }
      }

      const value: ReadJsonValue = {
        type: 'read-json',
        arguments: {
          json: complexJson,
          path: 'blockchain.ethereum.mainnet.contracts.erc20.1.symbol'
        }
      }
      
      expect(value.arguments.json).toEqual(complexJson)
      expect(value.arguments.path).toBe('blockchain.ethereum.mainnet.contracts.erc20.1.symbol')
    })

    it('should work with the example from the task description', () => {
      const exampleJson = {
        txs: {
          to: '0x596aF90CecdBF9A768886E771178fd5561dD27Ab',
          data: '0x1234'
        }
      }

      const value: ReadJsonValue = {
        type: 'read-json',
        arguments: {
          json: exampleJson,
          path: 'txs.data'
        }
      }
      
      expect(value.arguments.json).toEqual(exampleJson)
      expect(value.arguments.path).toBe('txs.data')
    })

    it('should support root level access', () => {
      const value: ReadJsonValue = {
        type: 'read-json',
        arguments: {
          json: 'simple string value',
          path: ''
        }
      }
      
      expect(value.arguments.json).toBe('simple string value')
      expect(value.arguments.path).toBe('')
    })

    it('should support accessing array elements directly', () => {
      const value: ReadJsonValue = {
        type: 'read-json',
        arguments: {
          json: ['first', 'second', 'third'],
          path: '1'
        }
      }
      
      expect(value.arguments.json).toEqual(['first', 'second', 'third'])
      expect(value.arguments.path).toBe('1')
    })

    it('should support mixed object and array access', () => {
      const value: ReadJsonValue = {
        type: 'read-json',
        arguments: {
          json: {
            results: [
              { id: 1, data: { value: 'first' } },
              { id: 2, data: { value: 'second' } }
            ]
          },
          path: 'results.0.data.value'
        }
      }
      
      expect(value.arguments.path).toBe('results.0.data.value')
    })

    it('should support boolean and number values in JSON', () => {
      const value: ReadJsonValue = {
        type: 'read-json',
        arguments: {
          json: {
            config: {
              enabled: true,
              maxRetries: 5,
              timeout: 30.5
            }
          },
          path: 'config.enabled'
        }
      }
      
      expect(value.arguments.json).toEqual({
        config: {
          enabled: true,
          maxRetries: 5,
          timeout: 30.5
        }
      })
    })

    it('should support null values in JSON', () => {
      const value: ReadJsonValue = {
        type: 'read-json',
        arguments: {
          json: {
            user: {
              name: 'John',
              avatar: null
            }
          },
          path: 'user.avatar'
        }
      }
      
      expect(value.arguments.json.user.avatar).toBeNull()
    })

    it('should work with response from json-request action', () => {
      // This simulates using the result of a json-request action
      const value: ReadJsonValue = {
        type: 'read-json',
        arguments: {
          json: '{{apiCall.response}}', // Reference to a json-request action output
          path: 'data.transactions.0.hash'
        }
      }
      
      expect(value.arguments.json).toBe('{{apiCall.response}}')
      expect(value.arguments.path).toBe('data.transactions.0.hash')
    })
  })
})