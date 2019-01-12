drop schema if exists zombodb_test cascade;

create schema zombodb_test;

create extension if not exists "zombodb";
