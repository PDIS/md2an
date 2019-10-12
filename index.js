#!/usr/bin/env node

const fs = require('fs');
const _ = require('lodash');
const jsonxml = require('jsontoxml');
const format = require('xml-formatter');
const marked = require('marked');
const he = require('he');
const Viz = require('viz.js');
const { Module, render } = require('viz.js/full.render.js');

let viz = new Viz({ Module, render });
let [, , ...args] = process.argv

const ConvertViz = async input => {
  if (/```graphviz/.exec(input)) {
    let vizString = input.replace('graphviz','').split('```')[1]
    let result = await viz.renderString(vizString)
    let count = 0
    let graphviz = ''
    result.split('\n').map( line => {
      if (count > 5)
      {
        if (/width/.test(line)) { 
          line = line.replace(line.match(/width\=(.*?) /)[1], '"100%"')
        }
        graphviz += line
      }
      count++
    })
    return graphviz
  } else {
    return ''
  }
}

const md2an = (input, graphviz) => {
  let references = []
  let debateSection = []
  let speakers = []
  let sections = input.replace(/\n:::info\n[\d\D]*?\n:::\n/, '').split('###')
  debateSection.push({'heading':(input.match(/^#* (.*)/) || [])[1]})
  if ( graphviz != '') {
    let narrative = {
      'name': 'narrative',
      children: [
        {
          'p': {
            'i': graphviz
          }
        }
      ]
    }
    debateSection.push(narrative)
  }
  sections.map( section => {
    // first section = ''
    if (! /\S/.test(section)) { return }
    // info section
    if (/🌐|📅|🏡/.exec(section)) {
      let lines = section.split(/\n+/)
      lines.map( line => {
        if (/(?=.*>)(?=.*\[)(?=.*（).*/.exec(line)) {
          let type = line.match(/\[(.*?)\]/)[1]
          let hyperlink = line.match(/\((.*?)\)/)[1]
          let first = line.match(/> (.*?)\[/)[1]
          let last = line.match(/\)(.*?)）/)[0].replace(')','')
          let narrative = {
            'name': 'narrative',
            children: [
              {
                'p': {
                  'i': `${first}<a href="${hyperlink}">${type}</a>${last}`
                }
              }
            ]
          }
          debateSection.push(narrative)
          return
        }
      })
      return
    }
    let speaker = (section.match(/ (.*?)[:：]/) || [])[1]
    // speaker sections
    if (speaker) {
      let context = section.replace(/ (.*?)[:：]/, '')
      context.split(/[\r\n]{2,}/).map( p => {
        if (!/\S/.test(p)) { return }
        if (/^>/.exec(p)) {
          let narrative = {
            'name': 'narrative',
            children: [
              {
                'p': {
                  'i': p.replace(/>/,'').replace(/\s+/,'')
                }
              }
            ]
          }
          debateSection.push(narrative)
          return
        }
        let speech = {
          'name': 'speech',
          'attrs': { 
            'by': '#' + speaker 
          },
          children: [
            {
              'p': he.decode(marked(p.replace(/^[\r\n]+/, ''), { smartypants: true })).replace(/^\s*<p>\s*|\s*<\/p>\s*$/g, ''),
            }
          ]
        }
        if (/<a href="/.test(speech.children[0].p)) {
          let linkbefore = speech.children[0].p.match(/<a href(.*?)>/)[0]
          let linkafter = linkbefore.replace('&', '&#x26;')
          speech.children[0].p = speech.children[0].p.replace(linkbefore, linkafter)
        }
        debateSection.push(JSON.parse(JSON.stringify(speech)))
      })
      speakers.push(speaker)
    }
  })
  speakers = _.uniq(speakers)
  speakers.map( speaker => {
    let TLCPerson = {
      'name': 'TLCPerson',
      'attrs': { 
        href: "/ontology/person/::/" + speaker,
        id: speaker,
        showAs: speaker,
      },
    }
    references.push(TLCPerson)
  })
  if (/Office Hour_/.test(debateSection[0].heading)) {
    let heading = debateSection[0].heading.replace(/_[^_]*$/, '')
    debateSection[0].heading = debateSection[0].heading.replace(/.*Office Hour_/, '')
    debateSection = [{'heading': heading}, {'debateSection': debateSection}]
  }
  let xml = jsonxml({
    'akomaNtoso':{
      'debate': {
        'meta': { 
          references 
        },
        'debateBody': 
        { 
          'debateSection': debateSection
        }
      }
    }
  }, {'xmlHeader': true, 'escape': true})
  let output = format(xml)
  output = output.replace(/&lt;/g, '<').replace(/&quot;/g,'"').replace(/&gt;/g,'>').replace(/&amp;/g,'&')
  return output
}

// const GetFilename  = (input) => {
//   return (input.match(/^#* (.*)/) || [])[1].replace(/\s/g, '-').replace(/Office-Hour_.*/, 'Office-Hour') + '.an.xml'
// }

// fs.readFile(args[0], async function (err, data) {
//   if (err) throw err;
//   let graphviz = await ConvertViz(data.toString())
//   fs.writeFile(GetFilename(data.toString()), md2an(data.toString(), graphviz), function(error) {
//     if (err)
//       console.log(err);
//     else
//       console.log('Write operation complete.');
//   })
// });

process.stdin.setEncoding('utf8').on('data', async function(data) {
  let graphviz = await ConvertViz(data.toString())
  process.stdout.write(md2an(data.toString(), graphviz))
})