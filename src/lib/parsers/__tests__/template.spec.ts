import * as fs from 'fs'
import * as path from 'path'
import { parseTemplate } from '../template'
import { isContractExistsCondition, isJobCompletedCondition, Template } from '../../types'

describe('parseTemplate', () => {
  // --- Happy Path Tests ---

  it('should correctly parse a valid template with a complex structure (sequence-factory-v1)', () => {
    const yamlPath = path.resolve(__dirname, '../../../../examples/templates/sequence-factory-v1.yaml')
    const yamlContent = fs.readFileSync(yamlPath, 'utf-8')

    const template = parseTemplate(yamlContent)

    expect(template.name).toBe('sequence-factory-v1')
    expect(template.arguments).toBeDefined()
    expect(template.returns).toBeDefined()
    expect(template.actions).toHaveLength(1)
    expect(template.outputs).toBeDefined()
    expect(template.outputs?.address).toBeDefined()

    // Test the specific 'setup' block parsing where it's an array of conditions
    expect(template.setup).toBeDefined()
    expect(template.setup?.actions).toBeUndefined() // No actions in this setup
    expect(template.setup?.skip_condition).toHaveLength(1)
    expect(isJobCompletedCondition(template.setup?.skip_condition?.[0])).toBe(true)
  })

  it('should correctly parse a template with an object-based setup block (nano-universal-deployer)', () => {
    const yamlPath = path.resolve(__dirname, '../../std/templates/nano-universal-deployer.yaml')
    const yamlContent = fs.readFileSync(yamlPath, 'utf-8')

    const template = parseTemplate(yamlContent)

    expect(template.name).toBe('nano-universal-deployer')

    // Test the specific 'setup' block parsing where it's a structured object
    expect(template.setup).toBeDefined()
    expect(template.setup?.actions).toHaveLength(3)
    expect(template.setup?.skip_condition).toHaveLength(1)
    expect(template.setup?.actions?.[0].type).toBe('test-nicks-method')
    expect(isContractExistsCondition(template.setup?.skip_condition?.[0])).toBe(true)
  })

  it('should parse a template with no optional fields like setup, description, arguments, or outputs', () => {
    const minimalYaml = `
name: minimal-template
actions:
  - type: send-transaction
    arguments:
      to: '0x123'
      data: '0xabc'
`
    const template = parseTemplate(minimalYaml)
    expect(template.name).toBe('minimal-template')
    expect(template.description).toBeUndefined()
    expect(template.arguments).toBeUndefined()
    expect(template.setup).toBeUndefined()
    expect(template.actions).toHaveLength(1)
    expect(template.outputs).toBeUndefined()
  })

  // --- Error Handling and Validation Tests ---

  it('should throw an error for malformed YAML', () => {
    const invalidYaml = `
name: bad-yaml
  actions: - item1
`
    expect(() => parseTemplate(invalidYaml)).toThrow(/Failed to parse template YAML:.* at line 2/)
  })

  it('should throw an error if the "name" field is missing', () => {
    const yamlContent = `
version: "1.0"
actions: []
`
    expect(() => parseTemplate(yamlContent)).toThrow('Invalid template: "name" field is required and must be a string.')
  })

  it('should throw an error if the "actions" field is missing or not an array', () => {
    const missingActions = `
name: "my-template"
`
    expect(() => parseTemplate(missingActions)).toThrow('Invalid template "my-template": "actions" field is required and must be an array.')

    const wrongTypeActions = `
name: "my-template"
actions: "not-an-array"
`
    expect(() => parseTemplate(wrongTypeActions)).toThrow('Invalid template "my-template": "actions" field is required and must be an array.')
  })

  it('should throw an error if the "outputs" field is not an object when provided', () => {
    const wrongTypeOutputs = `
name: "my-template"
actions: []
outputs: ["not-an-object"]
`
    expect(() => parseTemplate(wrongTypeOutputs)).toThrow('Invalid template "my-template": "outputs" field must be an object if provided.')
  })

  it('should throw an error if the "setup" field is not an array or object', () => {
    const invalidSetup = `
name: "my-template"
actions: []
setup: "i-am-a-string"
`
    expect(() => parseTemplate(invalidSetup)).toThrow('Invalid template "my-template": "setup" field must be an array or an object if provided.')
  })
})