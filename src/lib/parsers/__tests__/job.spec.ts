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
})