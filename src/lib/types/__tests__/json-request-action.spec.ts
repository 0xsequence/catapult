import { JsonRequestAction } from '../actions'

describe('JsonRequestAction', () => {
  describe('type definition', () => {
    it('should have correct type structure for basic GET request', () => {
      const action: JsonRequestAction = {
        type: 'json-request',
        arguments: {
          url: 'https://api.example.com/data'
        }
      }
      
      expect(action.type).toBe('json-request')
      expect(action.arguments.url).toBe('https://api.example.com/data')
    })

    it('should support optional method parameter', () => {
      const action: JsonRequestAction = {
        type: 'json-request',
        arguments: {
          url: 'https://api.example.com/data',
          method: 'POST'
        }
      }
      
      expect(action.arguments.method).toBe('POST')
    })

    it('should support optional headers parameter', () => {
      const action: JsonRequestAction = {
        type: 'json-request',
        arguments: {
          url: 'https://api.example.com/data',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer token123'
          }
        }
      }
      
      expect(action.arguments.headers).toEqual({
        'Content-Type': 'application/json',
        'Authorization': 'Bearer token123'
      })
    })

    it('should support optional body parameter', () => {
      const requestBody = {
        name: 'John Doe',
        email: 'john@example.com'
      }
      
      const action: JsonRequestAction = {
        type: 'json-request',
        arguments: {
          url: 'https://api.example.com/users',
          method: 'POST',
          body: requestBody
        }
      }
      
      expect(action.arguments.body).toEqual(requestBody)
    })

    it('should support template variables in url', () => {
      const action: JsonRequestAction = {
        type: 'json-request',
        arguments: {
          url: '{{apiBaseUrl}}/users/{{userId}}'
        }
      }
      
      expect(action.arguments.url).toBe('{{apiBaseUrl}}/users/{{userId}}')
    })

    it('should support template variables in method', () => {
      const action: JsonRequestAction = {
        type: 'json-request',
        arguments: {
          url: 'https://api.example.com/data',
          method: '{{httpMethod}}'
        }
      }
      
      expect(action.arguments.method).toBe('{{httpMethod}}')
    })

    it('should support template variables in headers', () => {
      const action: JsonRequestAction = {
        type: 'json-request',
        arguments: {
          url: 'https://api.example.com/data',
          headers: {
            'Authorization': '{{authToken}}',
            'X-API-Key': '{{apiKey}}'
          }
        }
      }
      
      expect(action.arguments.headers).toEqual({
        'Authorization': '{{authToken}}',
        'X-API-Key': '{{apiKey}}'
      })
    })

    it('should support template variables in body', () => {
      const action: JsonRequestAction = {
        type: 'json-request',
        arguments: {
          url: 'https://api.example.com/users',
          method: 'POST',
          body: {
            name: '{{userName}}',
            email: '{{userEmail}}',
            data: '{{userData}}'
          }
        }
      }
      
      expect(action.arguments.body).toEqual({
        name: '{{userName}}',
        email: '{{userEmail}}',
        data: '{{userData}}'
      })
    })

    it('should support complex nested body structures', () => {
      const action: JsonRequestAction = {
        type: 'json-request',
        arguments: {
          url: 'https://api.example.com/transactions',
          method: 'POST',
          body: {
            transaction: {
              to: '{{recipientAddress}}',
              value: '{{amount}}',
              data: '{{calldata}}'
            },
            metadata: {
              timestamp: '{{currentTime}}',
              source: 'live-contracts'
            }
          }
        }
      }
      
      expect(action.arguments.body).toEqual({
        transaction: {
          to: '{{recipientAddress}}',
          value: '{{amount}}',
          data: '{{calldata}}'
        },
        metadata: {
          timestamp: '{{currentTime}}',
          source: 'live-contracts'
        }
      })
    })

    it('should support all HTTP methods', () => {
      const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']
      
      methods.forEach(method => {
        const action: JsonRequestAction = {
          type: 'json-request',
          arguments: {
            url: 'https://api.example.com/data',
            method: method
          }
        }
        
        expect(action.arguments.method).toBe(method)
      })
    })

    it('should work with minimal configuration (only url)', () => {
      const action: JsonRequestAction = {
        type: 'json-request',
        arguments: {
          url: 'https://api.example.com/status'
        }
      }
      
      expect(action.type).toBe('json-request')
      expect(action.arguments.url).toBe('https://api.example.com/status')
      expect(action.arguments.method).toBeUndefined()
      expect(action.arguments.headers).toBeUndefined()
      expect(action.arguments.body).toBeUndefined()
    })

    it('should work with full configuration', () => {
      const action: JsonRequestAction = {
        type: 'json-request',
        arguments: {
          url: 'https://api.example.com/users',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer token123',
            'X-Custom-Header': 'custom-value'
          },
          body: {
            user: {
              name: 'Alice',
              email: 'alice@example.com',
              preferences: {
                theme: 'dark',
                notifications: true
              }
            },
            metadata: {
              source: 'api',
              version: '1.0'
            }
          }
        }
      }
      
      expect(action.type).toBe('json-request')
      expect(action.arguments.url).toBe('https://api.example.com/users')
      expect(action.arguments.method).toBe('POST')
      expect(action.arguments.headers).toEqual({
        'Content-Type': 'application/json',
        'Authorization': 'Bearer token123',
        'X-Custom-Header': 'custom-value'
      })
      expect(action.arguments.body).toEqual({
        user: {
          name: 'Alice',
          email: 'alice@example.com',
          preferences: {
            theme: 'dark',
            notifications: true
          }
        },
        metadata: {
          source: 'api',
          version: '1.0'
        }
      })
    })
  })
})