#!/usr/bin/env perl

use strict;
use warnings;
use v5.10;

my $apikey = (shift @ARGV) . "";

while (<>) {
    chomp;
    get($apikey, $_, $_, 1000);
}

sub get {
    my ($apikey, $output, $country, $limit) = @_;
    `curl -o data/athletes/$output.json --request GET "http://sochi.kimonolabs.com/api/athletes?country=$country&limit=$limit&apikey=$apikey"`;
}
