#!/bin/bash
ignore_files=(
'.git/*'
'.idea/*'
'./.gitignore'
'.github/*'
)

if [ ! -z $1 ]; then
  package_name=$1
else
  package_name=$(date +'%Y%m%d%H%M%S')
fi

zip -x "${ignore_files[@]}" -r "${package_name}".zip .
