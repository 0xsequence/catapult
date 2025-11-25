import * as fs from 'fs'
import * as path from 'path'
import { parseJob } from '../job'
import { Job } from '../../types'

describe('parseJob', () => {
  // --- Happy Path Tests ---

  it('should correctly parse a valid, complex job with multiple actions and dependencies (sequence-v1)', () => {
    const yamlPath = path.resolve(__dirname, '../../../../examples/jobs/sequence-v1.yaml')
    const yamlContent = fs.readFileSync(yamlPath, 'utf-8')

    const job: Job = parseJob(yamlContent)

    expect(job.name).toBe('sequence-v1')
    expect(job.version).toBe('1.0.0')
    expect(job.description).toBe('The Sequence v1 contracts')
    expect(job.depends_on).toBeUndefined()
    expect(job.actions).toHaveLength(6)

    // Spot-check a simple action
    const factoryAction = job.actions.find((a) => a.name === 'factory')
    expect(factoryAction).toBeDefined()
    expect(factoryAction?.template).toBe('sequence-universal-deployer-2')
    expect(factoryAction?.arguments).toEqual({
      creationCode: '{{Contract(sequence/v1/factory).creationCode}}',
      salt: '0',
    })
    expect(factoryAction?.depends_on).toBeUndefined()

    // Spot-check an action with dependencies and complex arguments
    const mainModuleAction = job.actions.find((a) => a.name === 'main-module')
    expect(mainModuleAction).toBeDefined()
    expect(mainModuleAction?.template).toBe('sequence-universal-deployer-2')
    expect(mainModuleAction?.depends_on).toEqual(['factory'])
    expect(mainModuleAction?.arguments).toEqual({
      salt: '0',
      creationCode: {
        type: 'constructor-encode',
        arguments: {
          creationCode: '{{Contract(sequence/v1/main-module).creationCode}}',
          types: ['address'],
          values: ['{{factory.address}}'],
        },
      },
    })
  })

  it('should correctly parse a job with job-level depends_on (guards-v1)', () => {
    const yamlPath = path.resolve(__dirname, '../../../../examples/jobs/guards-v1.yaml')
    const yamlContent = fs.readFileSync(yamlPath, 'utf-8')

    const job: Job = parseJob(yamlContent)

    expect(job.name).toBe('guards-v1')
    expect(job.version).toBe('1')
    expect(job.description).toBe('Deploy both prod and dev guards for Sequence v1')
    expect(job.depends_on).toEqual(['sequence-v1'])
    expect(job.actions).toHaveLength(2)
  })

  it('should handle numeric versions and convert them to strings', () => {
    const yamlContent = `
name: test-job
version: 1
description: A test job
actions:
  - name: action1
    template: tpl1
    arguments: {}
`
    const job = parseJob(yamlContent)
    expect(job.version).toBe('1')
    expect(typeof job.version).toBe('string')
  })

  // --- Error Handling and Validation Tests ---

  it('should throw an error for malformed YAML', () => {
    const invalidYaml = 'name: bad-yaml\n  actions: - item1'
    expect(() => parseJob(invalidYaml)).toThrow(/Failed to parse job YAML:.*at line 1/)
  })

  it('should throw an error if YAML content does not resolve to an object', () => {
    const invalidYaml = 'just-a-string'
    expect(() => parseJob(invalidYaml)).toThrow('Invalid job: YAML content must resolve to an object.')
  })

  it('should throw an error if the "name" field is missing', () => {
    const yamlContent = `
version: "1.0"
actions: []
`
    expect(() => parseJob(yamlContent)).toThrow('Invalid job: "name" field is required and must be a string.')
  })

  it('should throw an error if the "name" field is not a string', () => {
    const yamlContent = `
name: 12345
version: "1.0"
actions: []
`
    expect(() => parseJob(yamlContent)).toThrow('Invalid job: "name" field is required and must be a string.')
  })

  it('should throw an error if the "version" field is missing', () => {
    const yamlContent = `
name: "my-job"
actions: []
`
    expect(() => parseJob(yamlContent)).toThrow('Invalid job "my-job": "version" field is required.')
  })

  it('should throw an error if the "actions" field is missing', () => {
    const yamlContent = `
name: "my-job"
version: "1"
`
    expect(() => parseJob(yamlContent)).toThrow('Invalid job "my-job": "actions" field is required and must be an array.')
  })

  it('should throw an error if the "actions" field is not an array', () => {
    const yamlContent = `
name: "my-job"
version: "1"
actions: "not-an-array"
`
    expect(() => parseJob(yamlContent)).toThrow('Invalid job "my-job": "actions" field is required and must be an array.')
  })

  it('should throw an error if an item in the "actions" array is not an object', () => {
    const yamlContent = `
name: "my-job"
version: "1"
actions:
  - "i-am-a-string-not-an-object"
`
    expect(() => parseJob(yamlContent)).toThrow(
      'Invalid job "my-job": contains a non-object item in "actions" array.',
    )
  })

  it('should throw an error if an action is missing its "name" field', () => {
    const yamlContent = `
name: "my-job"
version: "1"
actions:
  - template: "my-template"
    arguments: {}
`
    expect(() => parseJob(yamlContent)).toThrow('Invalid job "my-job": an action is missing the required "name" field.')
  })

  it('should throw an error if an action is missing its "template" field', () => {
    const yamlContent = `
name: "my-job"
version: "1"
actions:
  - name: "my-action"
    arguments: {}
`
    expect(() => parseJob(yamlContent)).toThrow(
      'Invalid job "my-job": action "my-action" must have either a "template" field (for template actions) or a "type" field (for primitive actions).',
    )
  })

  it('should throw an error if an action is missing its "arguments" field', () => {
    const yamlContent = `
name: "my-job"
version: "1"
actions:
  - name: "my-action"
    template: "my-template"
`
    expect(() => parseJob(yamlContent)).toThrow(
      'Invalid job "my-job": action "my-action" is missing the required "arguments" field or it is not an object.',
    )
  })

  it('should throw an error if an action has "arguments" that are not an object', () => {
    const yamlContent = `
name: "my-job"
version: "1"
actions:
  - name: "my-action"
    template: "my-template"
    arguments: ["not", "an", "object"]
`
    expect(() => parseJob(yamlContent)).toThrow(
      'Invalid job "my-job": action "my-action" is missing the required "arguments" field or it is not an object.',
    )
  })

  // --- Output Field Tests ---
  
  it('should correctly parse actions with output: true', () => {
    const yamlContent = `
name: "my-job"
version: "1"
actions:
  - name: "action-with-output"
    template: "my-template"
    arguments: {}
    output: true
`
    const job = parseJob(yamlContent)
    expect(job.actions[0].output).toBe(true)
  })
  
  it('should correctly parse actions with output: false', () => {
    const yamlContent = `
name: "my-job"
version: "1"
actions:
  - name: "action-without-output"
    template: "my-template"
    arguments: {}
    output: false
`
    const job = parseJob(yamlContent)
    expect(job.actions[0].output).toBe(false)
  })
  
  it('should correctly parse actions with no output field (undefined)', () => {
    const yamlContent = `
name: "my-job"
version: "1"
actions:
  - name: "action-no-output"
    template: "my-template"
    arguments: {}
`
    const job = parseJob(yamlContent)
    expect(job.actions[0].output).toBeUndefined()
  })

  it('should correctly parse actions with output: object (custom map)', () => {
    const yamlContent = `
name: "my-job"
version: "1"
actions:
  - name: "action-custom"
    template: "my-template"
    arguments: {}
    output:
      address: "{{someAddress}}"
      txHash: "{{action-custom.hash}}"
`
    const job = parseJob(yamlContent)
    expect(typeof job.actions[0].output).toBe('object')
    expect(job.actions[0].output).toEqual({
      address: '{{someAddress}}',
      txHash: '{{action-custom.hash}}'
    } as any)
  })
  
  it('should throw an error if output field is not a boolean or object', () => {
    const yamlContent = `
name: "my-job"
version: "1"
actions:
  - name: "my-action"
    template: "my-template"
    arguments: {}
    output: "not-a-boolean"
`
    expect(() => parseJob(yamlContent)).toThrow(
      'Invalid job "my-job": action "my-action" has an invalid "output" field. It must be either a boolean (true/false) or an object mapping custom outputs.',
    )
  })
  
  it('should throw an error if output field is a number', () => {
    const yamlContent = `
name: "my-job"
version: "1"
actions:
  - name: "my-action"
    template: "my-template"
    arguments: {}
    output: 1
`
    expect(() => parseJob(yamlContent)).toThrow(
      'Invalid job "my-job": action "my-action" has an invalid "output" field. It must be either a boolean (true/false) or an object mapping custom outputs.',
    )
  })
  
  it('should correctly parse mixed actions with and without output fields', () => {
    const yamlContent = `
name: "my-job"
version: "1"
actions:
  - name: "action1"
    template: "template1"
    arguments: {}
    output: true
  - name: "action2"
    template: "template2"
    arguments: {}
  - name: "action3"
    template: "template3"
    arguments: {}
    output: false
  - name: "action4"
    template: "template4"
    arguments: {}
    output:
      important: "{{action4.hash}}"
`
    const job = parseJob(yamlContent)
    expect(job.actions[0].output).toBe(true)
    expect(job.actions[1].output).toBeUndefined()
    expect(job.actions[2].output).toBe(false)
    expect(job.actions[3].output).toEqual({ important: '{{action4.hash}}' } as any)
  })

  // --- New: Job-level constants field parsing ---

  it('should attach an optional job-level constants block as an object', () => {
    const yamlContent = `
name: "job-with-constants"
version: "1"
constants:
  FEE: "1000"
  ADMIN: "0x0000000000000000000000000000000000000001"
actions:
  - name: "a1"
    template: "t1"
    arguments:
      x: "{{FEE}}"
`
    const job = parseJob(yamlContent)
    expect(job.constants).toEqual({
      FEE: '1000',
      ADMIN: '0x0000000000000000000000000000000000000001'
    })
  })

  it('should parse job-level skip conditions', () => {
    const yamlContent = `
name: "job-with-skip"
version: "1"
skip_condition:
  - type: "contract-exists"
    arguments:
      address: "0xabc"
actions:
  - name: "a1"
    template: "t1"
    arguments: {}
`
    const job = parseJob(yamlContent)
    expect(job.skip_condition).toHaveLength(1)
    expect(job.skip_condition?.[0]).toEqual({
      type: 'contract-exists',
      arguments: { address: '0xabc' }
    })
  })
})