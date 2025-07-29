import { ArtifactReferenceValidator } from '../artifact-references'
import { ArtifactRegistry } from '../../artifacts/registry'
import { Job, Template } from '../../types'

describe('ArtifactReferenceValidator', () => {
  let registry: ArtifactRegistry
  let validator: ArtifactReferenceValidator

  beforeEach(() => {
    registry = new ArtifactRegistry()
    validator = new ArtifactReferenceValidator(registry)

    // Add some test artifacts
    registry.add({
      contractName: 'TestContract',
      abi: [{ type: 'function', name: 'test' }],
      bytecode: '0x608060405234801561000f575f5ffd5b50',
      _path: '/test/TestContract.json',
      _hash: 'test123'
    })

    registry.add({
      contractName: 'ContractWithoutBytecode',
      abi: [{ type: 'function', name: 'test' }],
      bytecode: undefined as any,
      _path: '/test/ContractWithoutBytecode.json',
      _hash: 'nobytecode123'
    })

    registry.add({
      contractName: 'ContractWithoutAbi',
      abi: undefined as any,
      bytecode: '0x608060405234801561000f575f5ffd5b50',
      _path: '/test/ContractWithoutAbi.json',
      _hash: 'noabi123'
    })
  })

  describe('validateAll', () => {
    it('should return no errors for valid artifact references', () => {
      const jobs = new Map<string, Job>([
        ['test-job', {
          name: 'test-job',
          version: '1.0.0',
          actions: [{
            name: 'deploy',
            template: 'deployer',
            arguments: {
              creationCode: '{{creationCode(TestContract)}}',
              abi: '{{abi(TestContract)}}'
            }
          }]
        }]
      ])

      const templates = new Map<string, Template>([
        ['deployer', {
          name: 'deployer',
          actions: [{
            type: 'send-transaction',
            arguments: {
              to: '0x123',
              data: '{{initCode(TestContract)}}'
            }
          }]
        }]
      ])

      const errors = validator.validateAll(jobs, templates)
      expect(errors).toHaveLength(0)
    })

    it('should detect missing artifacts in job actions', () => {
      const jobs = new Map<string, Job>([
        ['test-job', {
          name: 'test-job',
          version: '1.0.0',
          actions: [{
            name: 'deploy',
            template: 'deployer',
            arguments: {
              creationCode: '{{creationCode(NonExistentContract)}}'
            }
          }]
        }]
      ])

      const templates = new Map<string, Template>()

      const errors = validator.validateAll(jobs, templates)
      expect(errors).toHaveLength(1)
      expect(errors[0]).toEqual({
        type: 'missing_artifact',
        message: 'Artifact not found for identifier: "NonExistentContract"',
        location: 'job "test-job" action "deploy" argument "creationCode"',
        artifactIdentifier: 'NonExistentContract'
      })
    })

    it('should detect missing artifacts in template actions', () => {
      const jobs = new Map<string, Job>()
      const templates = new Map<string, Template>([
        ['deployer', {
          name: 'deployer',
          actions: [{
            type: 'send-transaction',
            arguments: {
              to: '0x123',
              data: '{{creationCode(MissingContract)}}'
            }
          }]
        }]
      ])

      const errors = validator.validateAll(jobs, templates)
      expect(errors).toHaveLength(1)
      expect(errors[0]).toEqual({
        type: 'missing_artifact',
        message: 'Artifact not found for identifier: "MissingContract"',
        location: 'template "deployer" action "send-transaction" argument "data"',
        artifactIdentifier: 'MissingContract'
      })
    })

    it('should detect missing artifacts in nested ValueResolver objects', () => {
      const jobs = new Map<string, Job>([
        ['test-job', {
          name: 'test-job',
          version: '1.0.0',
          actions: [{
            name: 'deploy',
            template: 'deployer',
            arguments: {
              creationCode: {
                type: 'constructor-encode',
                arguments: {
                  creationCode: '{{creationCode(MissingContract)}}',
                  types: ['address'],
                  values: ['0x123']
                }
              }
            }
          }]
        }]
      ])

      const templates = new Map<string, Template>()

      const errors = validator.validateAll(jobs, templates)
      expect(errors).toHaveLength(1)
      expect(errors[0].location).toBe('job "test-job" action "deploy" argument "creationCode".arguments.creationCode')
    })

    it('should detect artifacts missing required data', () => {
      const jobs = new Map<string, Job>([
        ['test-job', {
          name: 'test-job',
          version: '1.0.0',
          actions: [{
            name: 'deploy',
            template: 'deployer',
            arguments: {
              creationCode: '{{creationCode(ContractWithoutBytecode)}}',
              abi: '{{abi(ContractWithoutAbi)}}'
            }
          }]
        }]
      ])

      const templates = new Map<string, Template>()

      const errors = validator.validateAll(jobs, templates)
      expect(errors).toHaveLength(2)
      
      expect(errors[0]).toEqual({
        type: 'missing_artifact',
        message: 'Artifact "ContractWithoutBytecode" is missing bytecode for creationCode() function',
        location: 'job "test-job" action "deploy" argument "creationCode"',
        artifactIdentifier: 'ContractWithoutBytecode'
      })

      expect(errors[1]).toEqual({
        type: 'missing_artifact',
        message: 'Artifact "ContractWithoutAbi" is missing ABI for abi() function',
        location: 'job "test-job" action "deploy" argument "abi"',
        artifactIdentifier: 'ContractWithoutAbi'
      })
    })

    it('should detect empty artifact identifiers', () => {
      const jobs = new Map<string, Job>([
        ['test-job', {
          name: 'test-job',
          version: '1.0.0',
          actions: [{
            name: 'deploy',
            template: 'deployer',
            arguments: {
              creationCode: '{{creationCode()}}'
            }
          }]
        }]
      ])

      const templates = new Map<string, Template>()

      const errors = validator.validateAll(jobs, templates)
      expect(errors).toHaveLength(1)
      expect(errors[0]).toEqual({
        type: 'missing_artifact',
        message: 'Empty artifact identifier in creationCode() function',
        location: 'job "test-job" action "deploy" argument "creationCode"',
        artifactIdentifier: ''
      })
    })

    it('should handle arrays with artifact references', () => {
      const jobs = new Map<string, Job>([
        ['test-job', {
          name: 'test-job',
          version: '1.0.0',
          actions: [{
            name: 'deploy',
            template: 'deployer',
            arguments: {
              codes: [
                '{{creationCode(TestContract)}}',
                '{{creationCode(MissingContract)}}'
              ]
            }
          }]
        }]
      ])

      const templates = new Map<string, Template>()

      const errors = validator.validateAll(jobs, templates)
      expect(errors).toHaveLength(1)
      expect(errors[0].location).toBe('job "test-job" action "deploy" argument "codes"[1]')
    })

    it('should validate template setup actions', () => {
      const jobs = new Map<string, Job>()
      const templates = new Map<string, Template>([
        ['deployer', {
          name: 'deployer',
          setup: {
            actions: [{
              type: 'send-transaction',
              arguments: {
                to: '0x123',
                data: '{{creationCode(MissingContract)}}'
              }
            }]
          },
          actions: []
        }]
      ])

      const errors = validator.validateAll(jobs, templates)
      expect(errors).toHaveLength(1)
      expect(errors[0].location).toBe('template "deployer" setup action "send-transaction" argument "data"')
    })

    it('should validate template outputs', () => {
      const jobs = new Map<string, Job>()
      const templates = new Map<string, Template>([
        ['deployer', {
          name: 'deployer',
          actions: [],
          outputs: {
            address: '{{creationCode(MissingContract)}}'
          }
        }]
      ])

      const errors = validator.validateAll(jobs, templates)
      expect(errors).toHaveLength(1)
      expect(errors[0].location).toBe('template "deployer" output "address"')
    })

    it('should ignore non-artifact references', () => {
      const jobs = new Map<string, Job>([
        ['test-job', {
          name: 'test-job',
          version: '1.0.0',
          actions: [{
            name: 'deploy',
            template: 'deployer',
            arguments: {
              address: '{{factory.address}}',
              value: 'literal string',
              number: 42,
              boolean: true
            }
          }]
        }]
      ])

      const templates = new Map<string, Template>()

      const errors = validator.validateAll(jobs, templates)
      expect(errors).toHaveLength(0)
    })

    it('should support relative artifact references in templates', () => {
      // Add artifact that can be found via relative path
      registry.add({
        contractName: 'RelativeContract',
        abi: [{ type: 'function', name: 'test' }],
        bytecode: '0x608060405234801561000f575f5ffd5b50',
        _path: '/project/templates/deploy/artifacts/Contract.json',
        _hash: 'relative123'
      })

      const jobs = new Map<string, Job>()
      const templates = new Map<string, Template>([
        ['deploy-template', {
          name: 'deploy-template',
          _path: '/project/templates/deploy/template.yaml', // Template path for context
          actions: [{
            type: 'send-transaction',
            arguments: {
              to: '0x123',
              data: '{{creationCode(./artifacts/Contract.json)}}' // Relative reference
            }
          }]
        }]
      ])

      const errors = validator.validateAll(jobs, templates)
      expect(errors).toHaveLength(0) // Should validate successfully with relative reference
    })

    it('should detect missing relative artifacts in templates', () => {
      const jobs = new Map<string, Job>()
      const templates = new Map<string, Template>([
        ['deploy-template', {
          name: 'deploy-template',
          _path: '/project/templates/deploy/template.yaml', // Template path for context
          actions: [{
            type: 'send-transaction',
            arguments: {
              to: '0x123',
              data: '{{creationCode(./artifacts/NonExistent.json)}}' // Missing relative reference
            }
          }]
        }]
      ])

      const errors = validator.validateAll(jobs, templates)
      expect(errors).toHaveLength(1)
      expect(errors[0]).toEqual({
        type: 'missing_artifact',
        message: 'Artifact not found for identifier: "./artifacts/NonExistent.json"',
        location: 'template "deploy-template" action "send-transaction" argument "data"',
        artifactIdentifier: './artifacts/NonExistent.json'
      })
    })
  })
}) 